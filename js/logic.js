/* RTX Config Builder: pure logic (no DOM).
   build(state, {mask}) -> { lines, issues, errors, warns }
   Loaded as a classic script in the browser and with require() in Node tests. */

var MODELS = [
  { id:'RTX830', desc:'LAN ×4 / WAN ×1', vlanStyle:'divide', trunk:'lan1',
    ifs:[{id:'lan1',label:'LAN1（LANポート ×4）'},{id:'lan2',label:'LAN2（WANポート）'}],
    def:{lan:'lan1',wan:'lan2'},
    ports:[{ifc:'lan1',n:4},{ifc:'lan2',n:1,tag:'W'}],
    notes:['LAN1は4ポートのスイッチングハブ、LAN2はWAN用のポートです。','スループット 2Gbps、VPNスループット 1Gbps、VPN対地数 20。'] },
  { id:'RTX1210', desc:'1G ×8 + 1G ×2', vlanStyle:'divide', trunk:'lan3',
    ifs:[{id:'lan1',label:'LAN1（1000BASE-T ×8 スイッチ）'},{id:'lan2',label:'LAN2（1000BASE-T）'},{id:'lan3',label:'LAN3（1000BASE-T）'}],
    def:{lan:'lan1',wan:'lan2'},
    ports:[{ifc:'lan1',n:8},{ifc:'lan2',n:1},{ifc:'lan3',n:1}],
    notes:['工場出荷時は、LAN1が8ポートのスイッチングハブ、LAN2とLAN3が独立したポートです。'] },
  { id:'RTX1220', desc:'1G ×8 + 1G ×2', vlanStyle:'divide', trunk:'lan3',
    ifs:[{id:'lan1',label:'LAN1（1000BASE-T ×8 スイッチ）'},{id:'lan2',label:'LAN2（1000BASE-T）'},{id:'lan3',label:'LAN3（1000BASE-T）'}],
    def:{lan:'lan1',wan:'lan2'},
    ports:[{ifc:'lan1',n:8},{ifc:'lan2',n:1},{ifc:'lan3',n:1}],
    notes:['工場出荷時は、LAN1が8ポートのスイッチングハブ、LAN2とLAN3が独立したポートです。','最大スループット 2Gbps。'] },
  { id:'RTX1300', desc:'1G ×8 + 10G ×2', vlanStyle:'flex', trunk:'lan3',
    ifs:[{id:'lan1',label:'LAN1（1000BASE-T ×8 スイッチ）'},{id:'lan2',label:'LAN2（10G コンボ）'},{id:'lan3',label:'LAN3（10G コンボ）'}],
    def:{lan:'lan1',wan:'lan2'},
    ports:[{ifc:'lan1',n:8},{ifc:'lan2',n:1,fast:true},{ifc:'lan3',n:1,fast:true}],
    notes:['LAN2とLAN3は10GBASE-TとSFP+のコンボポートで、どちらか一方を使います。2.5G/5Gにも対応します。','最大スループット 9.9Gbps、IPsec 最大 3.8Gbps、VPN対地数は標準で100（ライセンスで拡張）。'] }
];
function modelById(id){ for (var i=0;i<MODELS.length;i++) if (MODELS[i].id===id) return MODELS[i]; return MODELS[0]; }

function defaults(){
  return {
    model:'RTX830', lanIf:'lan1', wanIf:'lan2', memo:'',
    lanIp:'192.168.100.1', lanPrefix:'24',
    dhcpOn:true, dhcpAuto:true, dhcpStart:'192.168.100.2', dhcpEnd:'192.168.100.191', dhcpExpire:'12',
    dhcpDnsMode:'router', dhcpDns1:'', dhcpDns2:'',
    wanType:'pppoe', pppoeUser:'', pppoePass:'', pppoeMtu:'1454', mss:true,
    wanIp:'', wanPrefix:'29', wanGw:'',
    nat:true, dnsMode:'auto', dns1:'8.8.8.8', dns2:'8.8.4.4',
    forwards:[], routes:[],
    vlanMode:'none', vlanTrunk:'lan1', vlanP:[], vlanT:[],
    vpnS:[], vpnHash:'sha256', vpnDh:'modp2048', vpnDpd:true, vpnMss:true,
    l2tpOn:false, l2tpPsk:'', l2tpClients:'2', l2tpPoolStart:'192.168.100.201', l2tpPoolEnd:'192.168.100.210', l2tpUsers:[{u:'',p:''}],
    adminPass:'', loginPass:'', httpd:true, telnet:'off', ssh:'lan', ntp:true,
    maskPw:true
  };
}

function ipToInt(s){
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s==null?'':s).trim());
  if (!m) return null;
  var n = 0;
  for (var i=1;i<=4;i++){ var v = Number(m[i]); if (v>255) return null; n = n*256+v; }
  return n;
}
function intToIp(n){ return [24,16,8,0].map(function(sh){ return Math.floor(n/Math.pow(2,sh))%256; }).join('.'); }
function subnet(n,p){ var size=Math.pow(2,32-p), net=Math.floor(n/size)*size; return {net:net,bc:net+size-1,size:size}; }
function inSub(n,s){ return n>=s.net && n<=s.bc; }
function overlap(a,b){ return a.net<=b.bc && b.net<=a.bc; }
function portOk(s){ return /^\d{1,5}$/.test(s) && Number(s)>=1 && Number(s)<=65535; }
function portSpecOk(s){
  if (portOk(s)) return true;
  var m = /^(\d{1,5})-(\d{1,5})$/.exec(s);
  return !!m && portOk(m[1]) && portOk(m[2]) && Number(m[1])<Number(m[2]);
}
function vlanRange(n, sub){
  var a = sub.net+2, b = Math.min(sub.bc-1, sub.net+191);
  if (n>=a && n<=b){ if (n-a >= b-n) b = n-1; else a = n+1; }
  return (a<=b) ? [a,b] : null;
}
function vlanRangeText(ipStr, pfx){
  var n = ipToInt(ipStr);
  if (n===null || !(Number(pfx)>=8 && Number(pfx)<=30) || !Number.isInteger(Number(pfx))) return '';
  var sub = subnet(n, Number(pfx));
  if (n===sub.net || n===sub.bc) return '';
  var r = vlanRange(n, sub);
  return r ? '配布範囲 '+intToIp(r[0])+' 〜 '+intToIp(r[1]) : '';
}
function prefixOk(v){ var p=Number(v); return v!=='' && Number.isInteger(p) && p>=8 && p<=30; }

function build(S, opts){
  var mask = !!(opts && opts.mask);
  var M = modelById(S.model);
  var lines = [], issues = [];
  function L(t,k){ lines.push({k:k||'n', t:t}); }
  function E(tab,msg){ issues.push({sev:'error',tab:tab,msg:msg}); }
  function W(tab,msg){ issues.push({sev:'warn',tab:tab,msg:msg}); }
  function sec(name){ L('# ---- '+name,'c'); }
  function secret(v,ph){ return v ? (mask ? '********' : v) : ph; }
  var lanIf=S.lanIf, wanIf=S.wanIf, t=S.wanType;

  if (lanIf===wanIf) E('model','LAN側とWAN側に同じインターフェースが選ばれています。');

  /* LAN */
  var lanIp = String(S.lanIp||'').trim();
  var lanN = ipToInt(lanIp), lanSub = null;
  if (lanN===null) E('lan','LANのIPアドレスを 192.168.100.1 の形式で入力してください。');
  else if (!prefixOk(S.lanPrefix)) E('lan','LANのプレフィックス長は8〜30の整数で入力してください。');
  else {
    lanSub = subnet(lanN, Number(S.lanPrefix));
    if (lanN===lanSub.net || lanN===lanSub.bc){ E('lan','LANのIPアドレスがネットワークアドレスまたはブロードキャストアドレスになっています。'); lanSub=null; }
  }

  /* DHCP */
  var dhcpOk = false, dhcpRange = null, hours = Number(S.dhcpExpire), dhcpDns = [];
  if (S.dhcpOn){
    var a = ipToInt(S.dhcpStart), b = ipToInt(S.dhcpEnd);
    if (a===null || b===null) E('lan','DHCPの開始・終了アドレスを正しく入力してください。');
    else if (lanSub){
      if (!inSub(a,lanSub) || !inSub(b,lanSub)) E('lan','DHCPの範囲が、LANのネットワークの外にあります。');
      else if (a>b) E('lan','DHCPの開始アドレスが、終了アドレスより後ろになっています。');
      else if (a===lanSub.net || b===lanSub.bc) E('lan','DHCPの範囲に、ネットワークアドレスまたはブロードキャストアドレスが含まれています。');
      else if (lanN>=a && lanN<=b) E('lan','DHCPの範囲に、ルーター自身のIPアドレスが含まれています。');
      else { dhcpOk = true; dhcpRange = [a,b]; }
    }
    if (!(Number.isInteger(hours) && hours>=1 && hours<=72)){ E('lan','DHCPのリース時間は1〜72時間の整数で入力してください。'); dhcpOk = false; }
    if (S.dhcpDnsMode==='custom'){
      var rawD = [S.dhcpDns1,S.dhcpDns2].map(function(x){return String(x||'').trim();}).filter(Boolean);
      if (!rawD.length) E('lan','配布するDNSサーバーを1つ以上入力してください。');
      rawD.forEach(function(x){ if (ipToInt(x)===null) E('lan','配布するDNSサーバー「'+x+'」の形式が正しくありません。'); else dhcpDns.push(x); });
    }
  }

  /* WAN */
  var wanSub = null, gwOk = false, mtuOk = false, credOk = true;
  var pUser = String(S.pppoeUser||'').trim(), pPass = String(S.pppoePass||'');
  var mtu = Number(S.pppoeMtu);
  if (t==='pppoe'){
    if (!pUser) W('wan','接続IDが未入力です。仮の値 user@example.ne.jp を出力しています。');
    if (!pPass) W('wan','接続パスワードが未入力です。仮の値 password を出力しています。');
    if (/\s/.test(pUser) || /\s/.test(pPass)){ E('wan','接続IDとパスワードに空白は使えません。'); credOk=false; }
    if (S.pppoeMtu!=='' && Number.isInteger(mtu) && mtu>=1200 && mtu<=1492) mtuOk = true;
    else E('wan','MTU / MRU は1200〜1492の整数で入力してください。');
  }
  if (t==='static'){
    var wi = ipToInt(S.wanIp), wg = ipToInt(S.wanGw);
    if (wi===null) E('wan','WAN側のIPアドレスを入力してください。');
    else if (!prefixOk(S.wanPrefix)) E('wan','WAN側のプレフィックス長は8〜30の整数で入力してください。');
    else {
      wanSub = subnet(wi, Number(S.wanPrefix));
      if (wi===wanSub.net || wi===wanSub.bc){ E('wan','WAN側のIPアドレスがネットワークアドレスまたはブロードキャストアドレスになっています。'); wanSub=null; }
    }
    if (wg===null) E('wan','デフォルトゲートウェイを入力してください。');
    else if (wanSub){
      if (inSub(wg,wanSub)) gwOk = true;
      else E('wan','デフォルトゲートウェイが、WAN側のネットワークの中にありません。');
    }
    if (lanSub && wanSub && overlap(lanSub,wanSub)){ E('wan','LANとWANのネットワークが重なっています。'); }
  }
  var dnsMode = (t==='static') ? 'manual' : S.dnsMode, dnsList = [];
  if (dnsMode==='manual'){
    var rawW = [S.dns1,S.dns2].map(function(x){return String(x||'').trim();}).filter(Boolean);
    if (!rawW.length) E('wan','DNSサーバーを1つ以上入力してください。');
    rawW.forEach(function(x){ if (ipToInt(x)===null) E('wan','DNSサーバー「'+x+'」の形式が正しくありません。'); else dnsList.push(x); });
  }

  /* VLAN */
  var vlanOut = [], vlanSubs = [], vlanScopes = [], vlanNames = [];
  var vmode = S.vlanMode;
  function vnet(row, ipStr, pfx){
    var ip = String(ipStr||'').trim(), n = ipToInt(ip);
    if (n===null){ E('vlan',row+'ルーターのIPアドレスを入力してください。'); return null; }
    if (!prefixOk(pfx)){ E('vlan',row+'プレフィックス長は8〜30の整数で入力してください。'); return null; }
    var sub = subnet(n, Number(pfx)), bad = false;
    if (n===sub.net || n===sub.bc){ E('vlan',row+'ルーターのIPアドレスがネットワークアドレスまたはブロードキャストアドレスになっています。'); return null; }
    if (lanSub && overlap(lanSub,sub)){ E('vlan',row+'ネットワークが、メインのLANと重なっています。'); bad = true; }
    if (wanSub && overlap(wanSub,sub)){ E('vlan',row+'ネットワークが、WAN側のネットワークと重なっています。'); bad = true; }
    vlanSubs.forEach(function(v){ if (overlap(v.sub,sub)){ E('vlan',row+'ネットワークが、'+v.label+' と重なっています。'); bad = true; } });
    if (bad) return null;
    return {ip:ip, n:n, sub:sub, pfx:Number(pfx)};
  }
  function vdhcp(id, net, on, gw){
    if (on!=='1') return;
    var r = vlanRange(net.n, net.sub);
    if (!r){ W('vlan',gw+'：DHCPで配るアドレスを確保できません。'); return; }
    vlanScopes.push({id:id, a:r[0], b:r[1], pfx:net.pfx, gw:net.ip});
  }
  if (vmode==='port'){
    var rowsP = (S.vlanP||[]).map(function(r,i){ return {r:r,i:i}; }).filter(function(x){ return String(x.r.ip||'').trim() || String(x.r.ports||'').trim(); });
    if (rowsP.length){
      var swN = M.ports[0].n, style = M.vlanStyle, maxExtra = style==='flex' ? 5 : swN-1, okMode = true;
      if (lanIf!=='lan1' || wanIf==='lan1'){ E('vlan','ポートVLANは、LAN側にLAN1、WAN側にLAN1以外を選んでいるときに使えます。'); okMode = false; }
      if (rowsP.length>maxExtra){ E('vlan','この機種で追加できるVLANは'+maxExtra+'つまでです。'); okMode = false; }
      var owner = {}, tmp = [];
      rowsP.forEach(function(x,j){
        var r = x.r, row = 'VLAN '+(x.i+1)+'：', ok = true;
        var ports = String(r.ports||'').split(',').filter(Boolean).map(Number);
        if (!ports.length){ E('vlan',row+'所属ポートを1つ以上選んでください。'); ok = false; }
        ports.forEach(function(pn){
          if (!(Number.isInteger(pn) && pn>=1 && pn<=swN)){ E('vlan',row+'ポート番号は1〜'+swN+'で選んでください。'); ok = false; }
          else if (owner[pn]){ E('vlan',row+'ポート'+pn+'が、VLAN '+owner[pn].label+' と重複しています。'); ok = false; }
          else owner[pn] = {j:j, label:x.i+1};
        });
        var net = vnet(row, r.ip, r.prefix);
        if (!net) ok = false; else vlanSubs.push({sub:net.sub, label:'VLAN '+(x.i+1)});
        tmp.push({x:x, ports:ports, net:net, ok:ok, name:(style==='flex' ? 'lan'+(j+4) : 'vlan'+(j+2)), dhcp:r.dhcp});
      });
      var mainPorts = [];
      for (var pp=1; pp<=swN; pp++) if (!owner[pp]) mainPorts.push(pp);
      if (!mainPorts.length){ E('vlan','メインのLANに残るポートがありません。1つ以上は、どのVLANにも割り当てずに残してください。'); okMode = false; }
      if (okMode && tmp.every(function(t2){ return t2.ok; })){
        var rng = function(list){
          var out = [], st = null, pv = null;
          list.forEach(function(v){ if (st===null){ st = pv = v; } else if (v===pv+1){ pv = v; } else { out.push(st===pv ? ''+st : st+'-'+pv); st = pv = v; } });
          if (st!==null) out.push(st===pv ? ''+st : st+'-'+pv);
          return out.join(',');
        };
        if (style==='flex'){
          var parts = ['lan1='+rng(mainPorts), 'lan2=9', 'lan3=10'];
          tmp.forEach(function(t2){ parts.push(t2.name+'='+rng(t2.ports.slice().sort(function(a,b){return a-b;}))); });
          vlanOut.push({k:'n',t:'lan flexible-port '+parts.join(' ')});
          vlanOut.push({k:'c',t:'# lan flexible-port takes effect after: save, then restart'});
        } else {
          vlanOut.push({k:'n',t:'lan type lan1 port-based-option=divide-network'});
          for (var q=1; q<=swN; q++) vlanOut.push({k:'n',t:'vlan port mapping lan1.'+q+' '+(owner[q] ? 'vlan'+(owner[q].j+2) : 'vlan1')});
          lanIf = 'vlan1';
        }
        tmp.forEach(function(t2){
          vlanOut.push({k:'n',t:'ip '+t2.name+' address '+t2.net.ip+'/'+t2.net.pfx});
          vlanNames.push(t2.name);
          vdhcp(2+vlanNames.length-1, t2.net, t2.dhcp, 'VLAN '+(t2.x.i+1));
        });
      } else vlanOut.push({k:'c',t:'# (VLAN skipped: check VLAN input)'});
    }
  } else if (vmode==='tag'){
    var rowsT = (S.vlanT||[]).map(function(r,i){ return {r:r,i:i}; }).filter(function(x){ return String(x.r.vid||'').trim() || String(x.r.ip||'').trim(); });
    if (rowsT.length){
      var trunk = S.vlanTrunk, okT = true;
      if (!M.ifs.some(function(i2){ return i2.id===trunk; })){ E('vlan','タグを通すインターフェースを選んでください。'); okT = false; }
      else if (trunk===wanIf){ E('vlan','タグを通すインターフェースに、WAN側と同じものは使えません。'); okT = false; }
      var seenV = {}, tmpT = [];
      rowsT.forEach(function(x,j){
        var r = x.r, row = 'VLAN '+(x.i+1)+'：', ok = true;
        var vid = String(r.vid||'').trim(), vn = Number(vid);
        if (!/^\d{1,4}$/.test(vid) || vn<2 || vn>4094){ E('vlan',row+'VLAN IDは2〜4094の整数で入力してください。'); ok = false; }
        else if (seenV[vn]){ E('vlan',row+'VLAN ID '+vn+' が、VLAN '+seenV[vn]+' と重複しています。'); ok = false; }
        else seenV[vn] = x.i+1;
        var net = vnet(row, r.ip, r.prefix);
        if (!net) ok = false; else vlanSubs.push({sub:net.sub, label:'VLAN '+(x.i+1)});
        tmpT.push({x:x, vid:vn, net:net, ok:ok, name:trunk+'/'+(j+1), dhcp:r.dhcp});
      });
      if (okT && tmpT.every(function(t2){ return t2.ok; })){
        tmpT.forEach(function(t2){
          vlanOut.push({k:'n',t:'vlan '+t2.name+' 802.1q vid='+t2.vid});
          vlanOut.push({k:'n',t:'ip '+t2.name+' address '+t2.net.ip+'/'+t2.net.pfx});
          vlanNames.push(t2.name);
          vdhcp(2+vlanNames.length-1, t2.net, t2.dhcp, 'VLAN '+(t2.x.i+1));
        });
      } else vlanOut.push({k:'c',t:'# (VLAN skipped: check VLAN input)'});
    }
  }
  var hoursOk = Number.isInteger(hours) && hours>=1 && hours<=72;
  if (vlanScopes.length && !S.dhcpOn && !hoursOk) E('lan','DHCPのリース時間は1〜72時間の整数で入力してください。');

  /* header + admin */
  L('# '+M.id+' config - generated by RTX Config Builder','c');
  var memo = String(S.memo||'').replace(/[\r\n]+/g,' ').trim();
  if (memo){
    L('# '+memo,'c');
    if (/[^\x00-\x7F]/.test(memo)) W('model','メモに全角文字が含まれています。端末の文字コード設定によっては、貼り付け時に文字化けすることがあります。');
  }
  sec('admin');
  var adminOk = !/\s/.test(S.adminPass||''), loginOk = !/\s/.test(S.loginPass||'');
  if (!adminOk) E('admin','管理パスワードに空白は使えません。');
  if (!loginOk) E('admin','ログインパスワードに空白は使えません。');
  if (S.adminPass && adminOk) L('administrator password '+secret(S.adminPass));
  if (S.loginPass && loginOk) L('login password '+secret(S.loginPass));
  if (!S.adminPass) W('admin','管理パスワードが未設定です。LANにつながる人なら誰でも設定を変更できます。');

  /* routing + interfaces */
  sec('routing');
  if (t==='pppoe') L('ip route default gateway pp 1');
  else if (t==='static'){ if (gwOk) L('ip route default gateway '+String(S.wanGw).trim()); else L('# (default route skipped: check WAN input)','c'); }
  else L('ip route default gateway dhcp '+wanIf);

  if (vlanOut.length){ sec('VLAN'); vlanOut.forEach(function(o){ L(o.t,o.k); }); }
  sec('LAN');
  if (lanSub) L('ip '+lanIf+' address '+lanIp+'/'+Number(S.lanPrefix));
  else L('# (LAN address skipped: check LAN input)','c');

  var natId = 1000, idn = 0;
  if (t==='static'){
    sec('WAN');
    if (wanSub) L('ip '+wanIf+' address '+String(S.wanIp).trim()+'/'+Number(S.wanPrefix));
    else L('# (WAN address skipped: check WAN input)','c');
    if (S.nat) L('ip '+wanIf+' nat descriptor '+natId);
  } else if (t==='dhcp'){
    sec('WAN');
    L('ip '+wanIf+' address dhcp');
    if (S.nat) L('ip '+wanIf+' nat descriptor '+natId);
  } else {
    sec('WAN (PPPoE)');
    L('pp select 1','h');
    L(' pp keepalive interval 30 retry-interval=30 count=12','s');
    L(' pp always-on on','s');
    L(' pppoe use '+wanIf,'s');
    L(' pppoe auto disconnect off','s');
    L(' pp auth accept pap chap','s');
    if (credOk) L(' pp auth myname '+(pUser||'user@example.ne.jp')+' '+secret(pPass,'password'),'s');
    L(' ppp lcp mru on '+(mtuOk?mtu:1454),'s');
    L(' ppp ipcp msext on','s');
    L(' ppp ccp type none','s');
    L(' ip pp mtu '+(mtuOk?mtu:1454),'s');
    if (S.mss) L(' ip pp tcp mss limit auto','s');
    if (S.nat) L(' ip pp nat descriptor '+natId,'s');
    L(' pp enable 1','s');
    L('pp select none','h');
  }

  /* NAT + port forwards */
  var fwRows = (S.forwards||[]).map(function(f,i){ return {f:f,i:i}; }).filter(function(x){
    var f=x.f; return String(f.ip||'').trim() || String(f.inner||'').trim() || String(f.outer||'').trim();
  });
  var vsRows = (S.vpnS||[]).map(function(r,i){ return {r:r,i:i}; }).filter(function(x){
    return String(x.r.remoteIp||'').trim() || String(x.r.remoteNet||'').trim() || String(x.r.psk||'');
  });
  var l2On = !!S.l2tpOn;
  var vpnActive = vsRows.length>0 || l2On;
  var vpnNatIp = (t==='static' && wanSub) ? String(S.wanIp).trim() : (lanN!==null ? lanIp : null);

  if (S.nat){
    sec('NAT');
    L('nat descriptor type '+natId+' masquerade');
    L('nat descriptor address outer '+natId+' primary');
    L('nat descriptor address inner '+natId+' auto');
    var seen = {};
    fwRows.forEach(function(x){
      var f=x.f, row='ポート開放 '+(x.i+1)+'行目：';
      var ip=String(f.ip||'').trim(), ipN=ipToInt(ip), proto=f.proto||'tcp';
      var outer=String(f.outer||'').trim(), inner=String(f.inner||'').trim(), ok=true;
      if (ipN===null){ E('forward',row+'転送先のIPアドレスを正しく入力してください。'); ok=false; }
      else if (lanSub && !inSub(ipN,lanSub) && !vlanSubs.some(function(v){ return inSub(ipN,v.sub); })) W('forward',row+'転送先がLANのネットワークの外にあります。');
      if (proto!=='esp'){
        if (!inner){ E('forward',row+'内部ポートを入力してください。'); ok=false; }
        else if (!portSpecOk(inner)){ E('forward',row+'内部ポートは 80 または 20-587 の形式で入力してください。'); ok=false; }
        if (outer){
          if (!portOk(outer)){ E('forward',row+'外部ポートは1〜65535の数字で入力してください。'); ok=false; }
          else if (inner && !portOk(inner)){ E('forward',row+'外部ポートを指定するときは、内部ポートを1つの番号にしてください。'); ok=false; }
        }
      }
      if (!ok) return;
      if (vpnActive && (proto==='esp' || (proto==='udp' && (outer||inner)!=='' && ['500','4500'].indexOf(outer||inner)>=0))) W('forward',row+'VPNで使う UDP 500・UDP 4500・ESP と重なっています。このポート開放の行は削除してください。');
      var key = proto+':'+(proto==='esp'?'-':(outer||inner));
      if (seen[key]) W('forward',row+'同じプロトコルとポートの設定が重複しています。');
      seen[key]=true;
      idn++;
      var portPart = proto==='esp' ? '' : ' '+(outer ? outer+'='+inner : inner);
      L('nat descriptor masquerade static '+natId+' '+idn+' '+ip+' '+proto+portPart);
    });
    if (vpnActive && vpnNatIp){
      L('# VPN: IKE, ESP, NAT-T','c');
      ['udp 500','esp','udp 4500'].forEach(function(spec){ idn++; L('nat descriptor masquerade static '+natId+' '+idn+' '+vpnNatIp+' '+spec); });
    }
  } else if (fwRows.length){
    W('forward','NATを使わない設定のため、ポート開放は出力されません。');
  }

  /* VPN */
  if (vpnActive){
    var hashSel = S.vpnHash==='sha' ? {ike:'sha',sa:'sha-hmac'} : {ike:'sha256',sa:'sha256-hmac'};
    var dhSel = S.vpnDh==='modp1024' ? 'modp1024' : 'modp2048';
    var ipsecLocal = (t==='static' && wanSub) ? String(S.wanIp).trim() : (lanN!==null ? lanIp : null);
    var lanCidr = lanSub ? intToIp(lanSub.net)+'/'+Number(S.lanPrefix) : null;
    var usedNets = [];
    if (t==='dhcp') W('vpn','WAN側がDHCPのため、上位のルーターで UDP 500、UDP 4500、ESP をこのルーターへ転送する設定が必要です。');

    vsRows.forEach(function(x){
      var r = x.r, k = x.i+1, row = '拠点 '+k+'：';
      var any = r.remoteType==='any', rip = String(r.remoteIp||'').trim();
      var m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(r.remoteNet||'').trim());
      var rn = m ? ipToInt(m[1]) : null, rp = m ? Number(m[2]) : -1;
      var psk = String(r.psk||''), ok = true, pskOk = true, rs = null, destStr = '';
      if (!any && ipToInt(rip)===null){ E('vpn',row+'相手のIPアドレスを入力してください。'); ok = false; }
      if (rn===null || rp<8 || rp>32){ E('vpn',row+'相手拠点のネットワークを 192.168.10.0/24 の形式で入力してください。'); ok = false; }
      else {
        rs = subnet(rn,rp); destStr = intToIp(rs.net)+'/'+rp;
        if (rs.net!==rn) W('vpn',row+'相手拠点のネットワークのホスト部が0ではないため、'+destStr+' として出力しています。');
        if (lanSub && overlap(lanSub,rs)){ E('vpn',row+'相手拠点のネットワークが、このLANと重なっています。'); ok = false; }
        vlanSubs.forEach(function(v){ if (overlap(v.sub,rs)){ E('vpn',row+'相手拠点のネットワークが、'+v.label+' と重なっています。'); ok = false; } });
        usedNets.forEach(function(u){ if (overlap(u.sub,rs)){ E('vpn',row+'相手拠点のネットワークが、拠点 '+u.k+' と重なっています。'); ok = false; } });
        usedNets.push({k:k,sub:rs});
      }
      if (!psk){ E('vpn',row+'事前共有鍵を入力してください。'); pskOk = false; }
      else if (/\s/.test(psk)){ E('vpn',row+'事前共有鍵に空白は使えません。'); pskOk = false; }
      else if (psk.length<8) W('vpn',row+'事前共有鍵が短いです。8文字以上をおすすめします。');
      sec('VPN: IPsec tunnel '+k);
      if (!ok || !pskOk){ L('# (tunnel '+k+' skipped: check VPN input)','c'); return; }
      L('tunnel select '+k,'h');
      L(' ipsec tunnel '+(100+k),'s');
      L('  ipsec sa policy '+(100+k)+' '+k+' esp aes-cbc '+hashSel.sa+((any && lanCidr) ? ' local-id='+lanCidr+' remote-id='+destStr : ''),'s');
      L('  ipsec ike duration ipsec-sa '+k+' 3600','s');
      L('  ipsec ike duration isakmp-sa '+k+' 3600','s');
      L('  ipsec ike encryption '+k+' aes-cbc','s');
      L('  ipsec ike group '+k+' '+dhSel,'s');
      L('  ipsec ike hash '+k+' '+hashSel.ike,'s');
      if (S.vpnDpd) L('  ipsec ike keepalive use '+k+' on dpd','s');
      if (ipsecLocal) L('  ipsec ike local address '+k+' '+ipsecLocal,'s');
      L('  ipsec ike nat-traversal '+k+' on','s');
      if (any) L('  ipsec ike payload type '+k+' 3','s');
      L('  ipsec ike pre-shared-key '+k+' text '+secret(psk),'s');
      L('  ipsec ike remote address '+k+' '+(any ? 'any' : rip),'s');
      if (S.vpnMss) L(' ip tunnel tcp mss limit auto','s');
      L(' tunnel enable '+k,'s');
      L('tunnel select none','h');
      L('ip route '+destStr+' gateway tunnel '+k);
    });

    if (l2On){
      var base = (S.vpnS||[]).length;
      var cl = Number(S.l2tpClients), clOk = Number.isInteger(cl) && cl>=1 && cl<=8;
      if (!clOk) E('vpn','L2TP/IPsecの同時接続数は1〜8の整数で入力してください。');
      var lpsk = String(S.l2tpPsk||''), lpskOk = true;
      if (!lpsk){ E('vpn','L2TP/IPsecの事前共有鍵を入力してください。'); lpskOk = false; }
      else if (/\s/.test(lpsk)){ E('vpn','L2TP/IPsecの事前共有鍵に空白は使えません。'); lpskOk = false; }
      else if (lpsk.length<8) W('vpn','L2TP/IPsecの事前共有鍵が短いです。8文字以上をおすすめします。');
      var users = [], seenU = {};
      (S.l2tpUsers||[]).forEach(function(u,i){
        var un = String(u.u||'').trim(), pw = String(u.p||'');
        if (!un && !pw) return;
        var urow = 'L2TPユーザー '+(i+1)+'行目：';
        if (!un || !pw){ E('vpn',urow+'ユーザー名とパスワードの両方を入力してください。'); return; }
        if (/\s/.test(un) || /\s/.test(pw)){ E('vpn',urow+'ユーザー名とパスワードに空白は使えません。'); return; }
        if (seenU[un]){ E('vpn',urow+'同じユーザー名が重複しています。'); return; }
        seenU[un] = true; users.push({u:un,p:pw});
      });
      if (!users.length) E('vpn','L2TP/IPsecの接続ユーザーを1人以上入力してください。');
      var pa = ipToInt(S.l2tpPoolStart), pb = ipToInt(S.l2tpPoolEnd), poolOk = false;
      if (pa===null || pb===null) E('vpn','クライアントに配るアドレス範囲を正しく入力してください。');
      else if (pa>pb) E('vpn','配布アドレスの開始が、終了より後ろになっています。');
      else if (lanSub && (!inSub(pa,lanSub) || !inSub(pb,lanSub))) E('vpn','配布アドレスの範囲が、LANのネットワークの外にあります。');
      else if (lanSub && (pa===lanSub.net || pb===lanSub.bc)) E('vpn','配布アドレスの範囲に、ネットワークアドレスまたはブロードキャストアドレスが含まれています。');
      else if (lanN!==null && lanN>=pa && lanN<=pb) E('vpn','配布アドレスの範囲に、ルーター自身のIPアドレスが含まれています。');
      else if (dhcpRange && pa<=dhcpRange[1] && pb>=dhcpRange[0]) E('vpn','配布アドレスの範囲が、DHCPの配布範囲と重なっています。');
      else if (clOk && (pb-pa+1)<cl) E('vpn','配布アドレスの数が、同時接続数より少なくなっています。');
      else poolOk = true;
      sec('VPN: L2TP/IPsec remote access');
      if (!(clOk && lpskOk && users.length && poolOk && ipsecLocal)){ L('# (L2TP/IPsec skipped: check VPN input)','c'); }
      else {
        for (var j=1; j<=cl; j++){
          var tn = base+j;
          L('tunnel select '+tn,'h');
          L(' tunnel encapsulation l2tp','s');
          L(' ipsec tunnel '+(100+tn),'s');
          L('  ipsec sa policy '+(100+tn)+' '+tn+' esp aes-cbc sha-hmac','s');
          L('  ipsec ike keepalive use '+tn+' off','s');
          L('  ipsec ike local address '+tn+' '+ipsecLocal,'s');
          L('  ipsec ike nat-traversal '+tn+' on','s');
          L('  ipsec ike pre-shared-key '+tn+' text '+secret(lpsk),'s');
          L('  ipsec ike remote address '+tn+' any','s');
          L(' l2tp tunnel auth off','s');
          L(' l2tp tunnel disconnect time off','s');
          L(' l2tp keepalive use on 10 3','s');
          L(' tunnel enable '+tn,'s');
          L('tunnel select none','h');
          L('ipsec transport '+tn+' '+(100+tn)+' udp 1701');
        }
        L('pp select anonymous','h');
        L(' pp bind '+(cl===1 ? 'tunnel'+(base+1) : 'tunnel'+(base+1)+'-tunnel'+(base+cl)),'s');
        L(' pp auth request mschap-v2','s');
        users.forEach(function(u){ L(' pp auth username '+u.u+' '+secret(u.p),'s'); });
        L(' ppp ipcp msext on','s');
        L(' ip pp remote address pool '+intToIp(pa)+'-'+intToIp(pb),'s');
        L(' ip pp mtu 1258','s');
        L(' pp enable anonymous','s');
        L('pp select none','h');
        L('ip '+lanIf+' proxyarp on');
        L('l2tp service on l2tp');
      }
    }
    sec('VPN: common');
    L('ipsec auto refresh on');
  }

  /* static routes */
  var rtRows = (S.routes||[]).map(function(r,i){ return {r:r,i:i}; }).filter(function(x){ return String(x.r.dest||'').trim() || String(x.r.gw||'').trim(); });
  if (rtRows.length){
    sec('static routes');
    rtRows.forEach(function(x){
      var row='ルート '+(x.i+1)+'行目：';
      var dest=String(x.r.dest||'').trim(), gw=String(x.r.gw||'').trim();
      var m=/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(dest);
      var dn = m ? ipToInt(m[1]) : null, dp = m ? Number(m[2]) : -1, gn = ipToInt(gw), ok=true;
      if (dn===null || dp<1 || dp>32){ E('route',row+'宛先を 10.1.0.0/16 の形式で入力してください。'); ok=false; }
      if (gn===null){ E('route',row+'ゲートウェイのIPアドレスを正しく入力してください。'); ok=false; }
      if (!ok) return;
      var ds = subnet(dn,dp), destStr = intToIp(ds.net)+'/'+dp;
      if (ds.net!==dn) W('route',row+'宛先のホスト部が0ではないため、'+destStr+' として出力しています。');
      if (!((lanSub && inSub(gn,lanSub)) || (wanSub && inSub(gn,wanSub)))) W('route',row+'ゲートウェイが、LAN側のネットワークの中にありません。');
      L('ip route '+destStr+' gateway '+gw);
    });
  }

  /* DHCP */
  var mainScope = !!(S.dhcpOn && dhcpOk);
  if (mainScope || vlanScopes.length){
    sec('DHCP');
    L('dhcp service server');
    L('dhcp server rfc2131 compliant except remote-id');
    if (mainScope){
      L('dhcp scope 1 '+String(S.dhcpStart).trim()+'-'+String(S.dhcpEnd).trim()+'/'+Number(S.lanPrefix)+' gateway '+lanIp+' expire '+hours+':00');
      if (S.dhcpDnsMode==='custom' && dhcpDns.length) L('dhcp scope option 1 dns='+dhcpDns.join(','));
    }
    vlanScopes.forEach(function(v){
      L('dhcp scope '+v.id+' '+intToIp(v.a)+'-'+intToIp(v.b)+'/'+v.pfx+' gateway '+v.gw+' expire '+(hoursOk ? hours : 12)+':00');
      if (S.dhcpOn && S.dhcpDnsMode==='custom' && dhcpDns.length) L('dhcp scope option '+v.id+' dns='+dhcpDns.join(','));
    });
  }

  /* DNS */
  sec('DNS');
  L('dns host '+[lanIf].concat(vlanNames).join(' '));
  L('dns service recursive');
  if (dnsMode==='auto') L(t==='pppoe' ? 'dns server pp 1' : 'dns server dhcp '+wanIf);
  else if (dnsList.length) L('dns server '+dnsList.join(' '));
  L('dns private address spoof on');

  /* management */
  sec('management');
  if (S.httpd) L('httpd host '+lanIf); else L('httpd service off');
  if (S.telnet==='lan') L('telnetd host '+lanIf); else L('telnetd service off');
  if (S.ssh==='lan'){
    L('sshd service on');
    L('sshd host '+lanIf);
    L('# if no SSH host key exists yet, run once on the router: ssh server host key generate','c');
  }
  if (!S.httpd && S.telnet!=='lan' && S.ssh!=='lan') W('admin','Web GUI、Telnet、SSHがすべてオフです。LANから管理できなくなり、シリアルコンソールだけが頼りになります。');

  if (S.ntp){
    sec('time');
    L('timezone +09:00');
    L('schedule at 1 startup * ntpdate ntp.nict.jp syslog');
    L('schedule at 2 */* 03:00 * ntpdate ntp.nict.jp syslog');
  }

  lines = lines.filter(function(o,i){
    if (o.k!=='c' || o.t.indexOf('# ---- ')!==0) return true;
    var nx = lines[i+1];
    return !!nx && !(nx.k==='c' && nx.t.indexOf('# ---- ')===0);
  });

  var errors = 0, warns = 0;
  issues.forEach(function(x){ if (x.sev==='error') errors++; else warns++; });
  return { lines:lines, issues:issues, errors:errors, warns:warns };
}
function toText(lines){ return lines.map(function(o){ return o.t; }).join('\n')+'\n'; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MODELS, modelById, defaults, build, toText, vlanRange, vlanRangeText, ipToInt, intToIp, subnet };
}
