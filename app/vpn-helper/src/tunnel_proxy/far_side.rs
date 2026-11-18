//! The far side of the tunnel, for tests: a stack of its own at 10.9.0.2 (an SSH-like server that greets, then
//! echoes) and 10.9.0.53 (DNS: login.example.edu is 10.9.0.2). The unit tests use it over a socketpair;
//! examples/far_side.rs over stdin and stdout, behind a make-believe VPN server (tests/connect/test_vpn_local.py).

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use smoltcp::iface::{Config, Interface, SocketSet};
use smoltcp::phy::{Device, DeviceCapabilities, Medium, RxToken, TxToken};
use smoltcp::socket::{tcp, udp};
use smoltcp::time::Instant;
use smoltcp::wire::{HardwareAddress, IpAddress, IpCidr, Ipv4Address};

/// Packets to and from the tunnel's other end.
pub trait Wire {
    /// The packets that came (waits a few ms at most).
    fn take(&self) -> Vec<Vec<u8>>;
    fn put(&self, packet: &[u8]);
}

#[cfg(unix)]
#[allow(dead_code)] // the example uses stdin and stdout
pub struct Datagram(std::os::unix::net::UnixDatagram);

#[cfg(unix)]
#[allow(dead_code)]
impl Datagram {
    pub fn new(s: std::os::unix::net::UnixDatagram) -> Datagram {
        s.set_read_timeout(Some(std::time::Duration::from_millis(5))).unwrap();
        Datagram(s)
    }
}

#[cfg(unix)]
impl Wire for Datagram {
    fn take(&self) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        let mut buf = [0; 2048];
        while let Ok(n) = self.0.recv(&mut buf) {
            out.push(buf[..n].to_vec());
        }
        out
    }
    fn put(&self, packet: &[u8]) {
        let _ = self.0.send(packet);
    }
}

struct Dev<'a>(&'a dyn Wire, VecDeque<Vec<u8>>);
struct R(Vec<u8>);
struct T<'a>(&'a dyn Wire);
impl RxToken for R {
    fn consume<X, F: FnOnce(&[u8]) -> X>(self, f: F) -> X {
        f(&self.0)
    }
}
impl TxToken for T<'_> {
    fn consume<X, F: FnOnce(&mut [u8]) -> X>(self, len: usize, f: F) -> X {
        let mut p = vec![0; len];
        let r = f(&mut p);
        self.0.put(&p);
        r
    }
}
impl Device for Dev<'_> {
    type RxToken<'b> = R where Self: 'b;
    type TxToken<'b> = T<'b> where Self: 'b;
    fn receive(&mut self, _: Instant) -> Option<(R, T<'_>)> {
        self.1.pop_front().map(|p| (R(p), T(self.0)))
    }
    fn transmit(&mut self, _: Instant) -> Option<T<'_>> {
        Some(T(self.0))
    }
    fn capabilities(&self) -> DeviceCapabilities {
        let mut c = DeviceCapabilities::default();
        c.medium = Medium::Ip;
        c.max_transmission_unit = 1300;
        c
    }
}

fn answer(query: &[u8]) -> Option<Vec<u8>> {
    let mut i = 12;
    let mut name = Vec::new();
    while *query.get(i)? != 0 {
        let n = query[i] as usize;
        name.push(String::from_utf8_lossy(query.get(i + 1..i + 1 + n)?).to_string());
        i += 1 + n;
    }
    let question_end = i + 5;
    let mut out = query[..2].to_vec();
    let known = name.join(".") == "login.example.edu";
    out.extend_from_slice(if known { &[0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0] } else { &[0x81, 0x83, 0, 1, 0, 0, 0, 0, 0, 0] });
    out.extend_from_slice(query.get(12..question_end)?);
    if known {
        out.extend_from_slice(&[0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 10, 9, 0, 2]);
    }
    Some(out)
}

pub fn run(wire: &dyn Wire, stop: Arc<AtomicBool>) {
    let mut dev = Dev(wire, VecDeque::new());
    let mut iface = Interface::new(Config::new(HardwareAddress::Ip), &mut dev, Instant::now());
    iface.update_ip_addrs(|a| {
        a.push(IpCidr::new(IpAddress::v4(10, 9, 0, 2), 24)).unwrap();
        a.push(IpCidr::new(IpAddress::v4(10, 9, 0, 53), 24)).unwrap();
    });
    iface.routes_mut().add_default_ipv4_route(Ipv4Address::new(10, 9, 0, 2)).unwrap();
    let mut sockets = SocketSet::new(vec![]);
    let mut servers = Vec::new();
    let mut greeted = Vec::new();
    for _ in 0..4 {
        let mut s = tcp::Socket::new(tcp::SocketBuffer::new(vec![0; 256 * 1024]),
                                     tcp::SocketBuffer::new(vec![0; 256 * 1024]));
        s.listen(22).unwrap();
        servers.push(sockets.add(s));
        greeted.push(false);
    }
    let mut dns = udp::Socket::new(
        udp::PacketBuffer::new(vec![udp::PacketMetadata::EMPTY; 8], vec![0; 4096]),
        udp::PacketBuffer::new(vec![udp::PacketMetadata::EMPTY; 8], vec![0; 4096]));
    dns.bind((IpAddress::v4(10, 9, 0, 53), 53)).unwrap(); // answers come from the address asked
    let dns = sockets.add(dns);
    while !stop.load(Ordering::SeqCst) {
        dev.1.extend(wire.take());
        iface.poll(Instant::now(), &mut dev, &mut sockets);
        let d = sockets.get_mut::<udp::Socket>(dns);
        if let Ok((q, meta)) = d.recv() {
            let q = q.to_vec();
            if let Some(a) = answer(&q) {
                d.send_slice(&a, meta.endpoint).unwrap();
            }
        }
        for (i, h) in servers.iter().enumerate() {
            let s = sockets.get_mut::<tcp::Socket>(*h);
            if s.is_active() && s.may_send() && !greeted[i] {
                s.send_slice(b"SSH-2.0-far-side\r\n").unwrap();
                greeted[i] = true;
            }
            while s.can_recv() && s.can_send() {
                let room = s.send_capacity() - s.send_queue(); // echo only what fits, the rest waits
                let data = s.recv(|b| {
                    let n = b.len().min(room);
                    (n, b[..n].to_vec())
                }).unwrap();
                assert_eq!(s.send_slice(&data).unwrap(), data.len());
            }
            if !s.may_recv() && s.state() == tcp::State::CloseWait {
                s.close();
            }
            if s.state() == tcp::State::Closed {
                s.listen(22).unwrap();
                greeted[i] = false;
            }
        }
        iface.poll(Instant::now(), &mut dev, &mut sockets);
    }
}
