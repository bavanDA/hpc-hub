//! A TCP/IP stack of its own (smoltcp) on the tunnel: each local port forwards to a host and port on the VPN's
//! side. Nothing on the computer changes, so it needs no administrator.
//!
//! One thread owns the stack. Others only wait: for the tunnel's packets, for new local connections, and for
//! each connection's bytes, and pass them on over a channel.

use std::collections::VecDeque;
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender, TryRecvError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use smoltcp::iface::{Config, Interface, SocketHandle, SocketSet};
use smoltcp::phy::{Device, DeviceCapabilities, Medium, RxToken, TxToken};
use smoltcp::socket::{dns, tcp};
use smoltcp::time::{Duration as SDuration, Instant};
use smoltcp::wire::{DnsQueryType, HardwareAddress, IpAddress, IpCidr, Ipv4Address};

use super::link::Link;

const BUFFER: usize = 512 * 1024; // each way, per connection: the TCP window
const CHUNK: usize = 16 * 1024;
const TO_LOCAL_LIMIT: usize = 1024 * 1024; // bytes waiting for the local side before the stack stops reading
const CONNECT_TIMEOUT: u64 = 60; // seconds without an answer, then the connection is given up

/// Where a local port leads.
#[derive(Clone, Debug, PartialEq)]
pub struct Forward {
    pub local: u16,
    pub host: String,
    pub port: u16,
}

/// What openconnect says about the tunnel (its environment for the script).
#[derive(Clone, Debug)]
pub struct Settings {
    pub address: Ipv4Addr,
    pub mtu: usize,
    pub dns: Vec<Ipv4Addr>,
    pub domains: Vec<String>,
    pub keepalive: Option<u64>,
}

enum Event {
    Packet(Vec<u8>),
    TunnelGone,
    Accepted(TcpStream, usize),
    Wake,
}

/// The stack's view of the tunnel: packets in from a queue the reader fills, out straight to the tunnel.
struct Tunnel<'a> {
    link: &'a dyn Link,
    incoming: VecDeque<Vec<u8>>,
    mtu: usize,
}

struct Rx(Vec<u8>);
struct Tx<'a>(&'a dyn Link);

impl RxToken for Rx {
    fn consume<R, F: FnOnce(&[u8]) -> R>(self, f: F) -> R {
        f(&self.0)
    }
}

impl TxToken for Tx<'_> {
    fn consume<R, F: FnOnce(&mut [u8]) -> R>(self, len: usize, f: F) -> R {
        let mut packet = vec![0; len];
        let r = f(&mut packet);
        if let Err(e) = self.0.send(&packet) {
            eprintln!("hpc-hub-vpn-tunnel: could not send into the tunnel: {e}");
        }
        r
    }
}

impl Device for Tunnel<'_> {
    type RxToken<'b> = Rx where Self: 'b;
    type TxToken<'b> = Tx<'b> where Self: 'b;

    fn receive(&mut self, _: Instant) -> Option<(Rx, Tx<'_>)> {
        self.incoming.pop_front().map(|p| (Rx(p), Tx(self.link)))
    }

    fn transmit(&mut self, _: Instant) -> Option<Tx<'_>> {
        Some(Tx(self.link))
    }

    fn capabilities(&self) -> DeviceCapabilities {
        let mut caps = DeviceCapabilities::default();
        caps.medium = Medium::Ip;
        caps.max_transmission_unit = self.mtu;
        caps
    }
}

enum Stage {
    Resolving(dns::QueryHandle),
    Open,
}

struct Conn {
    stage: Stage,
    socket: SocketHandle,
    target: usize,
    from_local: Receiver<Vec<u8>>, // empty: the local side closed its sending half
    pending: Vec<u8>,
    local_done: bool,
    to_local: Option<Sender<Vec<u8>>>,
    queued: Arc<AtomicUsize>,
    local: TcpStream,
}

impl Conn {
    fn close_local(&mut self) {
        self.to_local = None; // the writer finishes what it has, then shuts the write half
    }
}

/// Runs until the tunnel goes away. listeners[i] serves forwards[i].
pub fn run(link: Arc<dyn Link>, settings: Settings, forwards: Vec<Forward>, listeners: Vec<TcpListener>)
    -> io::Result<()> {
    let (events, inbox) = mpsc::channel::<Event>();
    {
        let link = link.clone();
        let events = events.clone();
        let size = settings.mtu.max(1500) + 64;
        thread::spawn(move || {
            let mut buf = vec![0; size];
            loop {
                match link.recv(&mut buf) {
                    Ok(0) | Err(_) => {
                        let _ = events.send(Event::TunnelGone);
                        return;
                    }
                    Ok(n) => {
                        if events.send(Event::Packet(buf[..n].to_vec())).is_err() {
                            return;
                        }
                    }
                }
            }
        });
    }
    for (i, listener) in listeners.into_iter().enumerate() {
        let events = events.clone();
        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(s) => {
                        if events.send(Event::Accepted(s, i)).is_err() {
                            return;
                        }
                    }
                    Err(e) => eprintln!("hpc-hub-vpn-tunnel: accept: {e}"),
                }
            }
        });
    }

    let mut device = Tunnel { link: link.as_ref(), incoming: VecDeque::new(), mtu: settings.mtu };
    let mut config = Config::new(HardwareAddress::Ip);
    config.random_seed = seed();
    let mut iface = Interface::new(config, &mut device, now());
    let me = Ipv4Address::from(settings.address.octets());
    iface.update_ip_addrs(|a| {
        let _ = a.push(IpCidr::new(IpAddress::Ipv4(me), 32));
    });
    // Medium::Ip has no neighbors: every packet goes into the tunnel, whatever the gateway says
    iface.routes_mut().add_default_ipv4_route(me).map_err(|_| io::Error::other("no route"))?;
    let mut sockets = SocketSet::new(vec![]);
    let servers: Vec<IpAddress> = settings.dns.iter().map(|d| IpAddress::Ipv4(Ipv4Address::from(d.octets()))).collect();
    let resolver = sockets.add(dns::Socket::new(&servers, vec![]));
    let mut conns: Vec<Conn> = Vec::new();
    let mut next_port: u16 = 49152;

    loop {
        let wait = iface.poll_delay(now(), &sockets).map(|d| Duration::from_micros(d.total_micros()))
            .unwrap_or(Duration::from_secs(1)).min(Duration::from_secs(1));
        let mut first = match inbox.recv_timeout(wait) {
            Ok(e) => Some(e),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => return Ok(()),
        };
        while let Some(event) = first.take().or_else(|| inbox.try_recv().ok()) {
            match event {
                Event::Packet(p) => device.incoming.push_back(p),
                Event::TunnelGone => {
                    eprintln!("hpc-hub-vpn-tunnel: the tunnel closed");
                    return Ok(());
                }
                Event::Wake => {}
                Event::Accepted(stream, i) => {
                    match open(&mut iface, &mut sockets, resolver, &settings, &forwards[i], stream, i,
                               &events, &mut next_port) {
                        Ok(c) => conns.push(c),
                        Err(e) => eprintln!("hpc-hub-vpn-tunnel: {}:{}: {e}", forwards[i].host, forwards[i].port),
                    }
                }
            }
            if device.incoming.len() >= 64 {
                break; // let the stack work through them
            }
        }
        iface.poll(now(), &mut device, &mut sockets);
        conns.retain_mut(|c| service(c, &mut iface, &mut sockets, resolver, &forwards, &settings, &mut next_port));
        iface.poll(now(), &mut device, &mut sockets);
    }
}

#[allow(clippy::too_many_arguments)]
fn open(iface: &mut Interface, sockets: &mut SocketSet, resolver: SocketHandle, settings: &Settings,
        forward: &Forward, local: TcpStream, target: usize, events: &Sender<Event>, next_port: &mut u16)
    -> io::Result<Conn> {
    let _ = local.set_nodelay(true);
    let mut socket = tcp::Socket::new(tcp::SocketBuffer::new(vec![0; BUFFER]), tcp::SocketBuffer::new(vec![0; BUFFER]));
    socket.set_nagle_enabled(false);
    socket.set_timeout(Some(SDuration::from_secs(CONNECT_TIMEOUT)));
    socket.set_keep_alive(settings.keepalive.map(SDuration::from_secs));
    let handle = sockets.add(socket);
    let stage = match forward.host.parse::<Ipv4Addr>() {
        Ok(ip) => {
            connect(iface, sockets, handle, ip, forward.port, next_port)?;
            Stage::Open
        }
        Err(_) => {
            let name = full_name(&forward.host, &settings.domains);
            match sockets.get_mut::<dns::Socket>(resolver).start_query(iface.context(), &name, DnsQueryType::A) {
                Ok(q) => Stage::Resolving(q),
                Err(e) => {
                    sockets.remove(handle);
                    return Err(io::Error::other(format!("can't look up {name}: {e:?}")));
                }
            }
        }
    };

    // the local side's bytes: read by a thread of their own, a few chunks ahead at most
    let (chunks, from_local) = mpsc::sync_channel::<Vec<u8>>(32);
    reader(local.try_clone()?, chunks, events.clone());
    let queued = Arc::new(AtomicUsize::new(0));
    let to_local = writer(local.try_clone()?, queued.clone(), events.clone());
    Ok(Conn { stage, socket: handle, target, from_local, pending: Vec::new(), local_done: false,
              to_local: Some(to_local), queued, local })
}

fn connect(iface: &mut Interface, sockets: &mut SocketSet, handle: SocketHandle, ip: Ipv4Addr, port: u16,
           next_port: &mut u16) -> io::Result<()> {
    let local_port = *next_port;
    *next_port = if *next_port >= 65000 { 49152 } else { *next_port + 1 };
    let remote = (IpAddress::Ipv4(Ipv4Address::from(ip.octets())), port);
    sockets.get_mut::<tcp::Socket>(handle).connect(iface.context(), remote, local_port)
        .map_err(|e| io::Error::other(format!("connect: {e:?}")))
}

fn reader(mut stream: TcpStream, chunks: SyncSender<Vec<u8>>, events: Sender<Event>) {
    thread::spawn(move || {
        let mut buf = vec![0; CHUNK];
        loop {
            let n = match stream.read(&mut buf) {
                Ok(n) => n,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                Err(_) => 0,
            };
            if chunks.send(buf[..n].to_vec()).is_err() || events.send(Event::Wake).is_err() || n == 0 {
                return;
            }
        }
    });
}

fn writer(mut stream: TcpStream, queued: Arc<AtomicUsize>, events: Sender<Event>) -> Sender<Vec<u8>> {
    let (to_local, data) = mpsc::channel::<Vec<u8>>();
    thread::spawn(move || {
        for chunk in data {
            if stream.write_all(&chunk).is_err() {
                let _ = stream.shutdown(Shutdown::Both);
                return;
            }
            queued.fetch_sub(chunk.len(), Ordering::SeqCst);
            let _ = events.send(Event::Wake);
        }
        let _ = stream.shutdown(Shutdown::Write);
    });
    to_local
}

/// Moves bytes both ways. false: the connection is over (its socket is removed).
fn service(c: &mut Conn, iface: &mut Interface, sockets: &mut SocketSet, resolver: SocketHandle,
           forwards: &[Forward], _settings: &Settings, next_port: &mut u16) -> bool {
    if let Stage::Resolving(q) = c.stage {
        let forward = &forwards[c.target];
        match sockets.get_mut::<dns::Socket>(resolver).get_query_result(q) {
            Err(dns::GetQueryResultError::Pending) => return true,
            Err(dns::GetQueryResultError::Failed) => {
                eprintln!("hpc-hub-vpn-tunnel: the VPN's DNS doesn't know {}", forward.host);
                return finish(c, sockets);
            }
            Ok(addrs) => {
                let ip = addrs.iter().find_map(|a| match a {
                    IpAddress::Ipv4(v4) => Some(Ipv4Addr::from(v4.octets())),
                    #[allow(unreachable_patterns)]
                    _ => None,
                });
                let Some(ip) = ip else {
                    eprintln!("hpc-hub-vpn-tunnel: {} has no IPv4 address", forward.host);
                    return finish(c, sockets);
                };
                if let Err(e) = connect(iface, sockets, c.socket, ip, forward.port, next_port) {
                    eprintln!("hpc-hub-vpn-tunnel: {}: {e}", forward.host);
                    return finish(c, sockets);
                }
                c.stage = Stage::Open;
            }
        }
    }

    let socket = sockets.get_mut::<tcp::Socket>(c.socket);
    // tunnel -> local, while the local side keeps up
    while socket.can_recv() && c.queued.load(Ordering::SeqCst) < TO_LOCAL_LIMIT {
        let Ok(chunk) = socket.recv(|buf| (buf.len(), buf.to_vec())) else { break };
        if chunk.is_empty() {
            break;
        }
        c.queued.fetch_add(chunk.len(), Ordering::SeqCst);
        match &c.to_local {
            Some(tx) if tx.send(chunk).is_ok() => {}
            _ => {
                socket.abort(); // the local side is gone
                return finish(c, sockets);
            }
        }
    }
    // local -> tunnel, while the stack has room
    while !c.local_done && socket.may_send() {
        if c.pending.is_empty() {
            match c.from_local.try_recv() {
                Ok(chunk) if chunk.is_empty() => {
                    c.local_done = true;
                    socket.close(); // FIN once what's queued has gone
                    break;
                }
                Ok(chunk) => c.pending = chunk,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    c.local_done = true;
                    socket.close();
                    break;
                }
            }
        }
        match socket.send_slice(&c.pending) {
            Ok(0) => break,
            Ok(n) => {
                c.pending.drain(..n);
            }
            Err(_) => break,
        }
    }
    // the far side finished sending and everything reached the local side
    if !socket.may_recv() && !socket.can_recv() && c.to_local.is_some() && socket.state() != tcp::State::SynSent {
        c.close_local();
    }
    match socket.state() {
        tcp::State::Closed | tcp::State::TimeWait => finish(c, sockets),
        _ => true,
    }
}

fn finish(c: &mut Conn, sockets: &mut SocketSet) -> bool {
    c.close_local();
    let _ = c.local.shutdown(Shutdown::Read); // its reader thread stops
    sockets.remove(c.socket);
    false
}

/// A name the VPN's DNS can answer: a short one ("login1") gets the VPN's first domain.
pub fn full_name(host: &str, domains: &[String]) -> String {
    match domains.first() {
        Some(d) if !host.contains('.') && !d.is_empty() => format!("{host}.{}", d.trim_matches('.')),
        _ => host.to_string(),
    }
}

fn now() -> Instant {
    Instant::now()
}

fn seed() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
    t ^ (u64::from(std::process::id()) << 32)
}
