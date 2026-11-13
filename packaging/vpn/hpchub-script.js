// HPC Hub's wrapper around vpnc-script-win.js, from docs/design/vpn-helper.md.
// openconnect runs it with cscript and HPCHUB_ROUTES="cidr cidr...", HPCHUB_DOMAINS="d d..." and HPCHUB_TAG
// (the tunnel's name). When HPCHUB_ROUTES has routes, only they go through the tunnel, not the ones the server
// pushes. When HPCHUB_DOMAINS has domains, only names in them go to the VPN's DNS servers, through NRPT rules
// with the comment "hpc-hub <tag>" (the helper removes them when the tunnel ends), and the tunnel adapter gets
// no DNS servers of its own: so several VPNs can be up side by side. Then the real vpnc-script-win.js (next to
// this file) runs in this same process, so it sees what we set.
// JScript is ECMAScript 3: no let, const, arrow functions, trim, map or forEach.

var HPCHUB = (function () {
    function words(text) {
        var parts = String(text || "").split(/\s+/), out = [], i;
        for (i = 0; i < parts.length; i++) {
            if (parts[i] !== "") out.push(parts[i]);
        }
        return out;
    }

    // a number from 0 to max, no leading zeros
    function uint(s, max) {
        return /^(0|[1-9][0-9]{0,2})$/.test(s) && parseInt(s, 10) <= max;
    }

    // "10.1.2.3" -> [10, 1, 2, 3], or null
    function ip4(s) {
        var parts = s.split("."), i;
        if (parts.length !== 4) return null;
        for (i = 0; i < 4; i++) {
            if (!uint(parts[i], 255)) return null;
            parts[i] = parseInt(parts[i], 10);
        }
        return parts;
    }

    // prefix length -> mask, e.g. 20 -> [255, 255, 240, 0]
    function mask4(len) {
        var out = [], i, bits;
        for (i = 0; i < 4; i++) {
            bits = Math.max(0, Math.min(8, len - 8 * i));
            out.push((256 - (1 << (8 - bits))) & 255);
        }
        return out;
    }

    // [[name, value], ...] to set before the real script runs. Throws on a bad route or domain.
    function splitVars(routesText, domainsText) {
        var vars = [], routes = words(routesText), domains = words(domainsText);
        var n4 = 0, n6 = 0, i, j, route, slash, addr, len, octets, mask, net;
        for (i = 0; i < routes.length; i++) {
            route = routes[i];
            slash = route.indexOf("/");
            addr = slash < 0 ? route : route.substring(0, slash);
            len = slash < 0 ? "" : route.substring(slash + 1);
            if (addr.indexOf(":") >= 0) {
                if (!/^[0-9A-Fa-f:.]+$/.test(addr)) throw new Error("not an IPv6 route: " + route);
                if (slash < 0) len = "128";
                if (!uint(len, 128)) throw new Error("bad prefix length: " + route);
                vars.push(["CISCO_IPV6_SPLIT_INC_" + n6 + "_ADDR", addr],
                          ["CISCO_IPV6_SPLIT_INC_" + n6 + "_MASKLEN", len]);
                n6++;
            } else {
                octets = ip4(addr);
                if (!octets) throw new Error("not an IPv4 route: " + route);
                if (slash < 0) len = "32";
                if (!uint(len, 32)) throw new Error("bad prefix length: " + route);
                mask = mask4(parseInt(len, 10));
                net = [];
                for (j = 0; j < 4; j++) net.push(octets[j] & mask[j]);  // routes refuse host bits
                vars.push(["CISCO_SPLIT_INC_" + n4 + "_ADDR", net.join(".")],
                          ["CISCO_SPLIT_INC_" + n4 + "_MASK", mask.join(".")],
                          ["CISCO_SPLIT_INC_" + n4 + "_MASKLEN", len]);
                n4++;
            }
        }
        if (n4 + n6 > 0) {
            // both counts, even 0, so neither family gets a default route through the tunnel
            vars.push(["CISCO_SPLIT_INC", String(n4)], ["CISCO_IPV6_SPLIT_INC", String(n6)]);
        }
        for (i = 0; i < domains.length; i++) {
            if (!/^[A-Za-z0-9.-]+$/.test(domains[i])) throw new Error("not a DNS domain: " + domains[i]);
        }
        if (domains.length) vars.push(["CISCO_SPLIT_DNS", domains.join(",")]);
        return vars;
    }

    // Split DNS: the PowerShell that adds the NRPT rule for these domains (each one and everything under it),
    // or "" when there is nothing to add. Throws on a bad name, domain or server.
    function dnsCommand(domainsText, tag, serversText, reason, systemRoot) {
        var domains = words(domainsText), servers = words(serversText), names = [], quoted = [], i;
        if (!domains.length) return "";
        if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(tag)) throw new Error("not a tunnel name: " + tag);
        if (reason !== "connect") return "";
        for (i = 0; i < domains.length; i++) {
            if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/.test(domains[i])) throw new Error("not a DNS domain: " + domains[i]);
            names.push("'." + domains[i] + "'", "'" + domains[i] + "'");
        }
        for (i = 0; i < servers.length; i++) {
            if (!/^[0-9A-Fa-f:.]+$/.test(servers[i])) throw new Error("not a DNS server: " + servers[i]);
            quoted.push("'" + servers[i] + "'");
        }
        if (!quoted.length) return "";
        return systemRoot + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive " +
            "-ExecutionPolicy Bypass -Command \"Add-DnsClientNrptRule -Namespace " + names.join(",") +
            " -NameServers " + quoted.join(",") + " -Comment 'hpc-hub " + tag + "'\"";
    }

    // Sets the variables in this process, adds the split DNS, and returns the real script's text.
    function prepare() {
        var shell = WScript.CreateObject("WScript.Shell");
        var env = shell.Environment("Process");
        var vars = splitVars(env("HPCHUB_ROUTES"), env("HPCHUB_DOMAINS")), i, command, code;
        for (i = 0; i < vars.length; i++) {
            env(vars[i][0]) = vars[i][1];  // JScript's way to set a COM property with an argument
            if (String(env(vars[i][0])) !== vars[i][1]) throw new Error("could not set " + vars[i][0]);
        }
        if (words(env("HPCHUB_DOMAINS")).length) {
            command = dnsCommand(env("HPCHUB_DOMAINS"), String(env("HPCHUB_TAG")), env("INTERNAL_IP4_DNS"),
                                 String(env("reason")), shell.ExpandEnvironmentStrings("%SystemRoot%"));
            if (command) {
                code = shell.Run(command, 0, true);  // 0: no window; true: wait
                if (code !== 0) throw new Error("could not add the VPN's DNS rules (PowerShell said " + code + ")");
            }
            env("INTERNAL_IP4_DNS") = "";  // so the real script gives the adapter no DNS servers
        }
        var fso = WScript.CreateObject("Scripting.FileSystemObject");
        var path = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "vpnc-script-win.js");
        var file = fso.OpenTextFile(path, 1);  // 1: reading
        try {
            return file.ReadAll();
        } finally {
            file.Close();
        }
    }

    return {mask4: mask4, splitVars: splitVars, dnsCommand: dnsCommand, prepare: prepare};
})();

if (typeof module !== "undefined" && module.exports) {
    module.exports = HPCHUB;  // tests run the parts above under node
} else {
    try {
        // at the top level, so the real script's variables and functions are global as usual;
        // it ends with WScript.Quit(<its exit code>)
        eval(HPCHUB.prepare());
    } catch (e) {
        WScript.Echo("hpchub-script: " + (e.message || e.description || e));
        WScript.Quit(2);
    }
    WScript.Quit(0);
}
