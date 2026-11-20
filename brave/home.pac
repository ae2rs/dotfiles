// Brave's proxy rules: home names go through the home tailnet's own tailscaled (launchd
// onl.factory.tailscale-home), since Tailscale.app stays on amo.co, which also routes 10.1.0.0/16.
// DIRECT after the proxy: if it is down, home is tried the ordinary way.
function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, ".factory.onl") || dnsDomainIs(host, ".home.arpa") ||
      host == "mabbox.bytel.fr" || shExpMatch(host, "10.1.*")) {
    return "SOCKS5 127.0.0.1:1055; DIRECT";
  }
  return "DIRECT";
}
