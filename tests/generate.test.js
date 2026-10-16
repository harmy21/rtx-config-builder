const test = require('node:test');
const assert = require('node:assert/strict');
const { MODELS, defaults, build, toText } = require('../js/logic.js');

/** State for a model with its default LAN/WAN/trunk interfaces. */
function state(model, extra) {
  const M = MODELS.find((m) => m.id === model);
  return Object.assign(defaults(), { model, lanIf: M.def.lan, wanIf: M.def.wan, vlanTrunk: M.trunk, adminPass: 'x' }, extra);
}
function cfg(S, mask) {
  const r = build(S, { mask: !!mask });
  return { r, text: toText(r.lines), has: (line) => toText(r.lines).split('\n').includes(line) };
}

test('default state: no VPN or VLAN lines, no errors', () => {
  const { r, text } = cfg(defaults());
  assert.equal(r.errors, 0);
  assert.doesNotMatch(text, /ipsec|l2tp|vlan|flexible-port/);
  assert.match(text, /^ip lan1 address 192\.168\.100\.1\/24$/m);
});

test('PPPoE: credentials are masked only when asked', () => {
  const S = state('RTX830', { pppoeUser: 'u@isp.jp', pppoePass: 'secret1', adminPass: 'adm1n' });
  assert.ok(cfg(S, false).has(' pp auth myname u@isp.jp secret1'));
  const masked = cfg(S, true);
  assert.ok(masked.has(' pp auth myname u@isp.jp ********'));
  assert.ok(masked.has('administrator password ********'));
  assert.doesNotMatch(masked.text, /secret1|adm1n/);
});

test('static WAN uses the gateway and WAN address', () => {
  const S = state('RTX1220', { wanType: 'static', wanIp: '203.0.113.2', wanPrefix: '29', wanGw: '203.0.113.1', dnsMode: 'manual' });
  const { r, has } = cfg(S);
  assert.equal(r.errors, 0);
  assert.ok(has('ip route default gateway 203.0.113.1'));
  assert.ok(has('ip lan2 address 203.0.113.2/29'));
});

test('port forward: outer=inner format, esp has no port', () => {
  const S = state('RTX830', { forwards: [
    { proto: 'tcp', outer: '8080', ip: '192.168.100.10', inner: '80' },
    { proto: 'esp', outer: '', ip: '192.168.100.12', inner: '' },
  ] });
  const { has } = cfg(S);
  assert.ok(has('nat descriptor masquerade static 1000 1 192.168.100.10 tcp 8080=80'));
  assert.ok(has('nat descriptor masquerade static 1000 2 192.168.100.12 esp'));
});

test('input errors are reported and the bad line is skipped', () => {
  const { r, text } = cfg(state('RTX830', { lanIp: '192.168.100.999' }));
  assert.ok(r.errors > 0);
  assert.match(text, /LAN address skipped/);
});

test('site-to-site IPsec: tunnel, route and NAT pass-through', () => {
  const S = state('RTX830', { vpnS: [{ remoteType: 'fixed', remoteIp: '203.0.113.10', remoteNet: '192.168.10.0/24', psk: 'supersecret1' }] });
  const { r, has } = cfg(S);
  assert.equal(r.errors, 0);
  assert.ok(has('tunnel select 1'));
  assert.ok(has('  ipsec ike remote address 1 203.0.113.10'));
  assert.ok(has('ip route 192.168.10.0/24 gateway tunnel 1'));
  assert.ok(has('nat descriptor masquerade static 1000 1 192.168.100.1 udp 500'));
  assert.ok(has('ipsec auto refresh on'));
});

test('IPsec peer network must not overlap the LAN', () => {
  const S = state('RTX830', { vpnS: [{ remoteType: 'fixed', remoteIp: '1.2.3.4', remoteNet: '192.168.100.0/24', psk: 'supersecret1' }] });
  const { r, text } = cfg(S);
  assert.ok(r.errors > 0);
  assert.match(text, /tunnel 1 skipped/);
});

test('L2TP/IPsec: tunnels continue after site tunnels and are bound to anonymous', () => {
  const S = state('RTX830', {
    vpnS: [{ remoteType: 'fixed', remoteIp: '203.0.113.10', remoteNet: '192.168.10.0/24', psk: 'supersecret1' }],
    l2tpOn: true, l2tpPsk: 'l2tpsecret', l2tpClients: '2', l2tpUsers: [{ u: 'alice', p: 'pw1' }],
  });
  const { r, has } = cfg(S);
  assert.equal(r.errors, 0);
  assert.ok(has(' pp bind tunnel2-tunnel3'));
  assert.ok(has('ipsec transport 3 103 udp 1701'));
  assert.ok(has(' pp auth username alice pw1'));
  assert.ok(has('l2tp service on l2tp'));
});

test('VLAN (port, RTX830): every port is mapped; main LAN becomes vlan1', () => {
  const S = state('RTX830', { vlanMode: 'port', vlanP: [{ ip: '192.168.101.1', prefix: '24', ports: '3,4', dhcp: '1' }] });
  const { r, has } = cfg(S);
  assert.equal(r.errors, 0);
  assert.ok(has('lan type lan1 port-based-option=divide-network'));
  assert.ok(has('vlan port mapping lan1.2 vlan1'));
  assert.ok(has('vlan port mapping lan1.3 vlan2'));
  assert.ok(has('ip vlan1 address 192.168.100.1/24'));
  assert.ok(has('dhcp scope 2 192.168.101.2-192.168.101.191/24 gateway 192.168.101.1 expire 12:00'));
  assert.ok(has('dns host vlan1 vlan2'));
});

test('VLAN (port, RTX1300): lan flexible-port assigns every port', () => {
  const S = state('RTX1300', { vlanMode: 'port', vlanP: [
    { ip: '192.168.101.1', prefix: '24', ports: '3,4', dhcp: '1' },
    { ip: '192.168.102.1', prefix: '24', ports: '7,8', dhcp: '1' },
  ] });
  const { has } = cfg(S);
  assert.ok(has('lan flexible-port lan1=1-2,5-6 lan2=9 lan3=10 lan4=3-4 lan5=7-8'));
  assert.ok(has('ip lan4 address 192.168.101.1/24'));
});

test('VLAN (port) refuses to leave the main LAN without ports', () => {
  const S = state('RTX830', { vlanMode: 'port', vlanP: [{ ip: '192.168.101.1', prefix: '24', ports: '1,2,3,4', dhcp: '1' }] });
  const { r } = cfg(S);
  assert.ok(r.errors > 0);
});

test('VLAN (tag): sub-interfaces on the trunk, duplicate VID rejected', () => {
  const ok = cfg(state('RTX1210', { vlanMode: 'tag', vlanT: [
    { vid: '10', ip: '192.168.101.1', prefix: '24', dhcp: '1' },
    { vid: '20', ip: '192.168.102.1', prefix: '24', dhcp: '0' },
  ] }));
  assert.equal(ok.r.errors, 0);
  assert.ok(ok.has('vlan lan3/1 802.1q vid=10'));
  assert.ok(ok.has('ip lan3/2 address 192.168.102.1/24'));
  const dup = cfg(state('RTX1210', { vlanMode: 'tag', vlanT: [
    { vid: '10', ip: '192.168.101.1', prefix: '24', dhcp: '1' },
    { vid: '10', ip: '192.168.102.1', prefix: '24', dhcp: '1' },
  ] }));
  assert.ok(dup.r.errors > 0);
});
