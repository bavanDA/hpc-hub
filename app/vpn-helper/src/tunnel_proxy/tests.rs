use super::stack::full_name;
use super::*;

fn args(line: &str) -> Vec<String> {
    line.split_whitespace().map(str::to_string).collect()
}

#[test]
fn forwards_like_ocproxy() {
    let a = parse_args(&args("-L 52011:login.example.edu:22 -k 30 --pid-file /tmp/x.pid")).unwrap();
    assert_eq!(a.forwards, vec![Forward { local: 52011, host: "login.example.edu".into(), port: 22 }]);
    assert_eq!(a.keepalive, Some(30));
    assert_eq!(a.pid_file.as_deref(), Some("/tmp/x.pid"));
    assert_eq!(parse_forward("2222:10.0.0.5:22").unwrap().host, "10.0.0.5");
}

#[test]
fn refuses_what_it_cant_forward() {
    assert!(parse_args(&args("")).is_err());
    assert!(parse_args(&args("-L 22")).is_err());
    assert!(parse_args(&args("-L x:host:22")).is_err());
    assert!(parse_args(&args("-L 1:host;rm:22")).is_err());
    assert!(parse_args(&args("-L 1:host:22 --unknown 1")).is_err());
    assert!(parse_args(&args("-L")).is_err());
}

#[test]
fn settings_from_openconnects_environment() {
    let env = |k: &str| match k {
        "INTERNAL_IP4_ADDRESS" => Some("10.9.0.10".to_string()),
        "INTERNAL_IP4_MTU" => Some("1390".to_string()),
        "INTERNAL_IP4_DNS" => Some("10.9.0.53 10.9.0.54".to_string()),
        "CISCO_DEF_DOMAIN" => Some("example.edu other.edu".to_string()),
        _ => None,
    };
    let s = settings(env, Some(30)).unwrap();
    assert_eq!(s.address, Ipv4Addr::new(10, 9, 0, 10));
    assert_eq!(s.mtu, 1390);
    assert_eq!(s.dns.len(), 2);
    assert_eq!(s.domains, vec!["example.edu", "other.edu"]);
    assert!(settings(|_| None, None).is_err());
    let odd = |k: &str| match k {
        "INTERNAL_IP4_ADDRESS" => Some("10.9.0.10".to_string()),
        "INTERNAL_IP4_MTU" => Some("12".to_string()),
        _ => None,
    };
    assert_eq!(settings(odd, None).unwrap().mtu, 1300);
}

#[test]
fn short_names_get_the_vpns_domain() {
    let d = vec!["example.edu".to_string()];
    assert_eq!(full_name("login1", &d), "login1.example.edu");
    assert_eq!(full_name("login1.example.edu", &d), "login1.example.edu");
    assert_eq!(full_name("login1", &[]), "login1");
}

#[cfg(unix)]
#[path = "far_side.rs"]
mod far_side;

#[cfg(unix)]
fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

#[cfg(unix)]
#[test]
fn forwards_a_port_through_the_tunnel_by_name() {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::os::unix::net::UnixDatagram;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    let (ours, theirs) = UnixDatagram::pair().unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let far = {
        let stop = stop.clone();
        std::thread::spawn(move || far_side::run(&far_side::Datagram::new(theirs), stop))
    };
    let port = free_port();
    let forward = Forward { local: port, host: "login".into(), port: 22 };
    let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
    let s = Settings { address: Ipv4Addr::new(10, 9, 0, 10), mtu: 1300, dns: vec![Ipv4Addr::new(10, 9, 0, 53)],
                       domains: vec!["example.edu".into()], keepalive: Some(30) };
    let link: Arc<dyn link::Link> = Arc::new(link::Datagram(ours.try_clone().unwrap()));
    let stack = std::thread::spawn(move || stack::run(link, s, vec![forward], vec![listener]));

    for round in 0..2 {
        let c = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        let mut r = BufReader::new(c.try_clone().unwrap());
        let mut line = String::new();
        r.read_line(&mut line).unwrap();
        assert_eq!(line, "SSH-2.0-far-side\r\n", "round {round}");
        // a megabyte there and back, in order
        let data: Vec<u8> = (0..1_000_000u32).map(|i| (i % 251) as u8).collect();
        let writer = {
            let mut c = c.try_clone().unwrap();
            let data = data.clone();
            std::thread::spawn(move || c.write_all(&data).unwrap())
        };
        let mut back = vec![0; data.len()];
        r.read_exact(&mut back).unwrap();
        writer.join().unwrap();
        assert!(back == data, "round {round}: the bytes came back changed");
    }

    stop.store(true, Ordering::SeqCst);
    far.join().unwrap();
    // the tunnel goes (openconnect's end closes): the stack stops
    ours.shutdown(std::net::Shutdown::Both).unwrap();
    assert!(stack.join().unwrap().is_ok());
}
