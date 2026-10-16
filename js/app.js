/* RTX Config Builder: UI (DOM, tabs, forms, preview). Uses the globals from logic.js. */

(function(){
'use strict';
var $ = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

var KEY = 'rtx-config-builder:v1';
var SECRET = ['pppoeUser','pppoePass','adminPass','loginPass','l2tpPsk'];
var TABS = [
  {id:'model',label:'機種'},{id:'lan',label:'LAN'},{id:'vlan',label:'VLAN'},{id:'wan',label:'WAN'},
  {id:'forward',label:'ポート開放'},{id:'route',label:'ルート'},{id:'vpn',label:'VPN'},{id:'admin',label:'管理'}
];
var ROLE = {lan:'LAN側',wan:'WAN側',off:'未使用'};
function cleanRows(list, tmpl){
  if (!Array.isArray(list)) return [];
  return list.slice(0,10).filter(function(x){ return x && typeof x==='object'; }).map(function(x){
    var o = {}; Object.keys(tmpl).forEach(function(k){ o[k] = typeof x[k]==='string' ? x[k] : tmpl[k]; }); return o;
  });
}
var S = defaults(), curTab = 'model', last = null, toastTimer = null, armTimer = null;

(function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (!o || typeof o!=='object') return;
    var d = defaults();
    Object.keys(d).forEach(function(k){ if (SECRET.indexOf(k)<0 && o[k]!==undefined && typeof o[k]===typeof d[k]) d[k]=o[k]; });
    d.forwards = cleanRows(d.forwards, {proto:'tcp',outer:'',ip:'',inner:''});
    d.routes = cleanRows(d.routes, {dest:'',gw:''});
    d.vpnS = cleanRows(d.vpnS, {remoteType:'fixed',remoteIp:'',remoteNet:'',psk:''});
    d.l2tpUsers = cleanRows(d.l2tpUsers, {u:'',p:''});
    d.forwards.forEach(function(f){ if (['tcp','udp','esp'].indexOf(f.proto)<0) f.proto='tcp'; });
    d.vpnS.forEach(function(r){ if (r.remoteType!=='any') r.remoteType='fixed'; });
    if (!d.l2tpUsers.length) d.l2tpUsers=[{u:'',p:''}];
    d.vlanP = cleanRows(d.vlanP, {ip:'',prefix:'24',ports:'',dhcp:'1'});
    d.vlanT = cleanRows(d.vlanT, {vid:'',ip:'',prefix:'24',dhcp:'1'});
    if (['none','port','tag'].indexOf(d.vlanMode)<0) d.vlanMode='none';
    var M = modelById(d.model);
    if (!M.ifs.some(function(i){return i.id===d.lanIf;}) || !M.ifs.some(function(i){return i.id===d.wanIf;})){ d.lanIf=M.def.lan; d.wanIf=M.def.wan; }
    S = d;
  } catch(e){}
})();
function save(){
  try {
    var o = JSON.parse(JSON.stringify(S));
    SECRET.forEach(function(k){ delete o[k]; });
    o.vpnS = (o.vpnS||[]).map(function(r){ r.psk=''; return r; });
    o.l2tpUsers = (o.l2tpUsers||[]).map(function(r){ r.p=''; return r; });
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch(e){}
}

/* ---------- rendering ---------- */
function renderTabs(){
  $('#tabs').innerHTML = TABS.map(function(t){
    return '<button type="button" role="tab" class="tab" id="t-'+t.id+'" data-tab="'+t.id+'" aria-controls="p-'+t.id+'" aria-selected="false" tabindex="-1">'+t.label+'<span class="badge" hidden></span></button>';
  }).join('');
}
function showTab(id){
  curTab = id;
  TABS.forEach(function(t){
    var on = t.id===id, b = $('#t-'+t.id), p = $('#p-'+t.id);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    p.hidden = !on;
  });
  var b = $('#t-'+id);
  if (b && b.scrollIntoView) b.scrollIntoView({block:'nearest',inline:'center'});
}
function renderModelCards(){
  $('#modelCards').innerHTML = MODELS.map(function(m){
    return '<label class="mcard"><input type="radio" name="model" data-k="model" value="'+m.id+'" id="model-'+m.id+'"><span class="m-box"><span class="m-name">'+m.id+'</span><span class="m-desc">'+esc(m.desc)+'</span></span></label>';
  }).join('');
}
function fillIfSelects(){
  var M = modelById(S.model);
  var opts = M.ifs.map(function(i){ return '<option value="'+i.id+'">'+esc(i.label)+'</option>'; }).join('');
  $('#lanIf').innerHTML = opts; $('#wanIf').innerHTML = opts;
  $('#lanIf').value = S.lanIf; $('#wanIf').value = S.wanIf;
  if (!M.ifs.some(function(i){ return i.id===S.vlanTrunk; })) S.vlanTrunk = M.trunk;
  $('#vlanTrunk').innerHTML = opts; $('#vlanTrunk').value = S.vlanTrunk;
  $('#modelNotes').innerHTML = M.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join('');
}
function renderPorts(){
  var M = modelById(S.model);
  var PW=24, GAP=3, GG=20, WF=40, PH=24, PAD=14, VW=380;
  var gs = M.ports.map(function(g){ var pw = g.fast ? WF : PW; return {g:g, pw:pw, w:g.n*pw+(g.n-1)*GAP}; });
  var total = gs.reduce(function(a,x){ return a+x.w; },0) + GG*(gs.length-1);
  var x0 = (VW-total)/2, x = x0, n = 0, labels = [];
  var s = '';
  s += '<rect class="chassis" x="'+(x0-PAD)+'" y="4" width="'+(total+PAD*2)+'" height="82" rx="8"/>';
  gs.forEach(function(o){
    var g=o.g, role = S.lanIf===g.ifc ? 'lan' : (S.wanIf===g.ifc ? 'wan' : 'off');
    labels.push(g.ifc.toUpperCase()+'は'+ROLE[role]);
    for (var i=0;i<g.n;i++){
      n++;
      var px = x + i*(o.pw+GAP);
      s += '<rect class="p-'+role+'" x="'+px+'" y="16" width="'+o.pw+'" height="'+PH+'" rx="3"/>';
      s += '<text class="pn pn-'+role+'" x="'+(px+o.pw/2)+'" y="32">'+(g.fast ? '10G' : (g.tag || n))+'</text>';
    }
    var cx = x + o.w/2;
    s += '<text class="gl" x="'+cx+'" y="58">'+g.ifc.toUpperCase()+'</text>';
    s += '<text class="gr gr-'+role+'" x="'+cx+'" y="73">'+ROLE[role]+'</text>';
    x += o.w + GG;
  });
  $('#portsSvg').innerHTML = '<svg class="pv" viewBox="0 0 '+VW+' 90" role="img" aria-label="'+esc(M.id+'のポート割り当て：'+labels.join('、'))+'">'+s+'</svg>';
}
function syncForm(){
  $$('[data-k]').forEach(function(el){
    var k = el.dataset.k;
    if (el.type==='checkbox') el.checked = !!S[k];
    else if (el.type==='radio') el.checked = (String(S[k])===el.value);
    else el.value = S[k]==null ? '' : S[k];
  });
}
function applyWhen(){
  $$('[data-when]').forEach(function(el){
    var p = el.dataset.when.split('='), k = p[0], vals = p[1].split('|');
    var v = (k==='dnsMode' && S.wanType==='static') ? 'manual' : S[k];
    el.hidden = vals.indexOf(String(v))<0;
  });
}
function fwRow(f,i){
  var id = 'fw-'+i;
  var esp = f.proto==='esp';
  return '<div class="row" data-list="forwards" data-i="'+i+'">'+
    '<div class="f"><label for="'+id+'-proto">プロトコル</label><select id="'+id+'-proto" data-f="proto">'+
      ['tcp','udp','esp'].map(function(p){ return '<option value="'+p+'"'+(f.proto===p?' selected':'')+'>'+p.toUpperCase()+'</option>'; }).join('')+'</select></div>'+
    '<div class="f"><label for="'+id+'-outer">外部ポート（省略可）</label><input id="'+id+'-outer" data-f="outer" type="text" inputmode="numeric" placeholder="8080" autocomplete="off" value="'+esc(f.outer)+'"'+(esp?' disabled':'')+'></div>'+
    '<div class="f"><label for="'+id+'-ip">転送先のIP</label><input id="'+id+'-ip" data-f="ip" type="text" class="mono" inputmode="decimal" placeholder="192.168.100.10" autocomplete="off" spellcheck="false" value="'+esc(f.ip)+'"></div>'+
    '<div class="f"><label for="'+id+'-inner">内部ポート</label><input id="'+id+'-inner" data-f="inner" type="text" inputmode="numeric" placeholder="80 または 20-587" autocomplete="off" value="'+esc(f.inner)+'"'+(esp?' disabled':'')+'></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="'+(i+1)+'行目を削除">削除</button>'+
  '</div>';
}
function rtRow(r,i){
  var id = 'rt-'+i;
  return '<div class="row r2" data-list="routes" data-i="'+i+'">'+
    '<div class="f"><label for="'+id+'-dest">宛先ネットワーク</label><input id="'+id+'-dest" data-f="dest" type="text" class="mono" placeholder="10.1.0.0/16" autocomplete="off" spellcheck="false" value="'+esc(r.dest)+'"></div>'+
    '<div class="f"><label for="'+id+'-gw">ゲートウェイ</label><input id="'+id+'-gw" data-f="gw" type="text" class="mono" inputmode="decimal" placeholder="192.168.100.254" autocomplete="off" spellcheck="false" value="'+esc(r.gw)+'"></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="'+(i+1)+'行目を削除">削除</button>'+
  '</div>';
}
function vsRow(r,i){
  var id = 'vs-'+i, any = r.remoteType==='any';
  return '<div class="row r2" data-list="vpnS" data-i="'+i+'">'+
    '<p class="row-title">拠点 '+(i+1)+'（トンネル '+(i+1)+'）</p>'+
    '<div class="f"><label for="'+id+'-type">相手のIPアドレス</label><select id="'+id+'-type" data-f="remoteType"><option value="fixed"'+(any?'':' selected')+'>固定IPを指定</option><option value="any"'+(any?' selected':'')+'>不定（any）</option></select></div>'+
    '<div class="f"><label for="'+id+'-ip">相手のWAN側IP</label><input id="'+id+'-ip" data-f="remoteIp" type="text" class="mono" inputmode="decimal" placeholder="203.0.113.10" autocomplete="off" spellcheck="false" value="'+esc(r.remoteIp)+'"'+(any?' disabled':'')+'></div>'+
    '<div class="f"><label for="'+id+'-net">相手拠点のネットワーク</label><input id="'+id+'-net" data-f="remoteNet" type="text" class="mono" placeholder="192.168.10.0/24" autocomplete="off" spellcheck="false" value="'+esc(r.remoteNet)+'"></div>'+
    '<div class="f"><label for="'+id+'-psk">事前共有鍵</label><input id="'+id+'-psk" data-f="psk" type="password" autocomplete="new-password" spellcheck="false" value="'+esc(r.psk)+'"></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="拠点 '+(i+1)+' を削除">削除</button>'+
  '</div>';
}
function l2uRow(r,i){
  var id = 'l2u-'+i;
  return '<div class="row r2" data-list="l2tpUsers" data-i="'+i+'">'+
    '<div class="f"><label for="'+id+'-u">ユーザー名</label><input id="'+id+'-u" data-f="u" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="'+esc(r.u)+'"></div>'+
    '<div class="f"><label for="'+id+'-p">パスワード</label><input id="'+id+'-p" data-f="p" type="password" autocomplete="new-password" spellcheck="false" value="'+esc(r.p)+'"></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="ユーザー '+(i+1)+' を削除">削除</button>'+
  '</div>';
}
function vpRow(r,i){
  var M = modelById(S.model), id = 'vp-'+i, swN = M.ports[0].n;
  var name = M.vlanStyle==='flex' ? 'lan'+(i+4) : 'vlan'+(i+2);
  var set = String(r.ports||'').split(',').filter(Boolean), boxes = '';
  for (var n=1; n<=swN; n++) boxes += '<label class="pbox"><input type="checkbox" data-port="'+n+'" id="'+id+'-p'+n+'" aria-label="ポート '+n+'"'+(set.indexOf(String(n))>=0?' checked':'')+'><span>'+n+'</span></label>';
  return '<div class="row r2" data-list="vlanP" data-i="'+i+'">'+
    '<p class="row-title">VLAN '+(i+1)+'（'+name+'）</p>'+
    '<div class="f"><label for="'+id+'-ip">ルーターのIPアドレス</label><input id="'+id+'-ip" data-f="ip" type="text" class="mono" inputmode="decimal" placeholder="192.168.101.1" autocomplete="off" spellcheck="false" value="'+esc(r.ip)+'"></div>'+
    '<div class="f"><label for="'+id+'-pfx">プレフィックス長</label><input id="'+id+'-pfx" data-f="prefix" type="number" min="8" max="30" inputmode="numeric" value="'+esc(r.prefix)+'"></div>'+
    '<div class="f pf"><span class="lab">所属ポート（LAN1の1〜'+swN+'）</span><div class="pchk">'+boxes+'</div></div>'+
    '<div class="f pf"><label class="chk" for="'+id+'-dhcp"><input id="'+id+'-dhcp" data-f="dhcp" type="checkbox"'+(r.dhcp==='1'?' checked':'')+'><span>DHCPで配る<small data-rng></small></span></label></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="VLAN '+(i+1)+' を削除">削除</button>'+
  '</div>';
}
function vtRow(r,i){
  var id = 'vt-'+i;
  return '<div class="row r2" data-list="vlanT" data-i="'+i+'">'+
    '<p class="row-title">VLAN '+(i+1)+'（'+esc(S.vlanTrunk)+'/'+(i+1)+'）</p>'+
    '<div class="f"><label for="'+id+'-vid">VLAN ID</label><input id="'+id+'-vid" data-f="vid" type="text" class="mono" inputmode="numeric" placeholder="10" autocomplete="off" value="'+esc(r.vid)+'"><small>2〜4094</small></div>'+
    '<div class="f"><label for="'+id+'-ip">ルーターのIPアドレス</label><input id="'+id+'-ip" data-f="ip" type="text" class="mono" inputmode="decimal" placeholder="192.168.101.1" autocomplete="off" spellcheck="false" value="'+esc(r.ip)+'"></div>'+
    '<div class="f"><label for="'+id+'-pfx">プレフィックス長</label><input id="'+id+'-pfx" data-f="prefix" type="number" min="8" max="30" inputmode="numeric" value="'+esc(r.prefix)+'"></div>'+
    '<div class="f pf"><label class="chk" for="'+id+'-dhcp"><input id="'+id+'-dhcp" data-f="dhcp" type="checkbox"'+(r.dhcp==='1'?' checked':'')+'><span>DHCPで配る<small data-rng></small></span></label></div>'+
    '<button type="button" class="btn sm del" data-act="del" aria-label="VLAN '+(i+1)+' を削除">削除</button>'+
  '</div>';
}
function updateRanges(){
  $$('[data-rng]').forEach(function(el){
    var row = el.closest('[data-list]'), it = row ? S[row.dataset.list][Number(row.dataset.i)] : null;
    el.textContent = (it && it.dhcp==='1') ? vlanRangeText(it.ip,it.prefix) : '';
  });
}
function renderLists(){
  $('#vsRows').innerHTML = S.vpnS.length ? S.vpnS.map(vsRow).join('') : '<p class="empty">拠点間VPNはまだありません。拠点を追加すると、トンネルの設定が右側に出力されます。</p>';
  $('#l2uRows').innerHTML = S.l2tpUsers.map(l2uRow).join('');
  $('#vpRows').innerHTML = S.vlanP.length ? S.vlanP.map(vpRow).join('') : '<p class="empty">まだVLANがありません。追加すると、所属ポートとIPアドレスを入力できます。</p>';
  $('#vtRows').innerHTML = S.vlanT.length ? S.vlanT.map(vtRow).join('') : '<p class="empty">まだVLANがありません。追加すると、VLAN IDとIPアドレスを入力できます。</p>';
  $('#fwRows').innerHTML = S.forwards.length ? S.forwards.map(fwRow).join('') : '<p class="empty">まだ設定がありません。上のよく使う設定から選ぶか、行を追加してください。</p>';
  $('#rtRows').innerHTML = S.routes.length ? S.routes.map(rtRow).join('') : '<p class="empty">まだ経路がありません。別のネットワークへの経路が必要なときに追加してください。</p>';
}
var PRESETS = [
  {label:'HTTP 80',proto:'tcp',inner:'80'},{label:'HTTPS 443',proto:'tcp',inner:'443'},
  {label:'SSH 22',proto:'tcp',inner:'22'},{label:'リモートデスクトップ 3389',proto:'tcp',inner:'3389'}
];
function renderPresets(){
  $('#fwPresets').insertAdjacentHTML('beforeend', PRESETS.map(function(p,i){ return '<button type="button" class="chip" data-preset="'+i+'">'+esc(p.label)+'</button>'; }).join(''));
}

function renderOut(){
  var r = build(S,{mask:S.maskPw}); last = r;
  $('#conModel').textContent = modelById(S.model).id;
  $('#lineCount').textContent = r.lines.length+'行';
  $('#led').className = 'led'+(r.errors ? ' err' : (r.warns ? ' warn' : ''));
  $('#conLines').innerHTML = r.lines.map(function(o,i){
    return '<div class="ln k-'+o.k+'"><span class="no" aria-hidden="true">'+(i+1)+'</span><span class="tx">'+esc(o.t)+'</span></div>';
  }).join('');
  var tabName = {}; TABS.forEach(function(t){ tabName[t.id]=t.label; });
  var ih = '';
  if (r.issues.length){
    var sorted = r.issues.slice().sort(function(a,b){ return (a.sev===b.sev) ? 0 : (a.sev==='error' ? -1 : 1); });
    ih = '<h3>入力チェック（エラー '+r.errors+'件 / 注意 '+r.warns+'件）</h3>' + sorted.map(function(x){
      return '<button type="button" class="issue sev-'+x.sev+'" data-tab="'+x.tab+'"><span class="pill">'+(x.sev==='error'?'エラー':'注意')+'</span><span>'+esc(x.msg)+'</span><span class="where">'+esc(tabName[x.tab])+' ›</span></button>';
    }).join('');
  } else ih = '<h3>入力チェック</h3><p class="allgood">問題は見つかりませんでした。</p>';
  $('#issues').innerHTML = ih;

  TABS.forEach(function(t){
    var e=0,w=0; r.issues.forEach(function(x){ if (x.tab===t.id){ if (x.sev==='error') e++; else w++; } });
    var bd = $('#t-'+t.id+' .badge');
    bd.hidden = !(e||w);
    bd.className = 'badge'+(e?'':' warn');
    bd.textContent = e||w;
  });
  var sb = $('#swBadge'); sb.hidden = !(r.errors||r.warns); sb.textContent = r.errors||r.warns;
  sb.className = 'badge'+(r.errors?'':' warn');
}
function refresh(){ applyWhen(); renderPorts(); renderOut(); updateRanges(); save(); }

/* ---------- actions ---------- */
function toast(msg){
  var el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ el.hidden = true; }, 3200);
}
function fallbackCopy(text){
  try {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; ta.style.top='0';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch(e){ return false; }
}
function selectConsole(){
  try {
    var rng = document.createRange(); rng.selectNodeContents($('#conLines'));
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
  } catch(e){}
}
function copyConfig(){
  var r = build(S,{mask:false}), text = toText(r.lines);
  var done = function(){ toast(r.errors ? 'コピーしました。ただし、エラーが'+r.errors+'件残っています。' : 'configをコピーしました。'); };
  var fail = function(){
    if (fallbackCopy(text)) done();
    else { selectConsole(); toast('自動でコピーできませんでした。選択した本文をコピーしてください。'); }
  };
  try { navigator.clipboard.writeText(text).then(done, fail); } catch(e){ fail(); }
}
function autoRange(){
  var ip = ipToInt(S.lanIp), p = Number(S.lanPrefix);
  if (ip===null || !prefixOk(S.lanPrefix)) return false;
  var sub = subnet(ip,p), hosts = sub.size-2, start = sub.net+2, end = sub.net+Math.min(hosts,191);
  if (end<start) return false;
  S.dhcpStart = intToIp(start); S.dhcpEnd = intToIp(end);
  $('#dhcpStart').value = S.dhcpStart; $('#dhcpEnd').value = S.dhcpEnd;
  return true;
}
function autoPool(){
  var ip = ipToInt(S.lanIp), p = Number(S.lanPrefix);
  if (ip===null || !prefixOk(S.lanPrefix)) return false;
  var sub = subnet(ip,p), first = sub.net+2, last = sub.bc-1;
  if (last<first) return false;
  var a = sub.net+201, b = sub.net+210;
  if (b>last){ b = last; a = Math.max(first, b-9); }
  S.l2tpPoolStart = intToIp(a); S.l2tpPoolEnd = intToIp(b);
  $('#l2tpPoolStart').value = S.l2tpPoolStart; $('#l2tpPoolEnd').value = S.l2tpPoolEnd;
  return true;
}
function setModel(id){
  var M = modelById(id);
  S.model = M.id; S.lanIf = M.def.lan; S.wanIf = M.def.wan; S.vlanTrunk = M.trunk;
  fillIfSelects(); renderLists();
}
function setView(v){
  $('#layout').dataset.view = v;
  $$('#switchBar button').forEach(function(b){ b.setAttribute('aria-pressed', b.dataset.view===v ? 'true' : 'false'); });
  window.scrollTo(0,0);
}
function onField(el){
  var k = el.dataset.k;
  if (el.type==='radio' && !el.checked) return;
  var v = el.type==='checkbox' ? el.checked : el.value;
  var prev = S[k];
  S[k] = v;
  if (k==='model'){ setModel(v); }
  else if (k==='lanIf' && v===S.wanIf){ S.wanIf = prev; $('#wanIf').value = prev; }
  else if (k==='wanIf' && v===S.lanIf){ S.lanIf = prev; $('#lanIf').value = prev; }
  else if (k==='lanIp' || k==='lanPrefix'){ if (S.dhcpAuto) autoRange(); }
  else if (k==='dhcpStart' || k==='dhcpEnd'){ S.dhcpAuto = false; }
  else if (k==='wanType' && v==='static'){ S.dnsMode = 'manual'; syncForm(); }
  else if (k==='vlanTrunk'){ renderLists(); }
  refresh();
}

/* ---------- wiring ---------- */
renderTabs(); renderModelCards(); renderPresets(); fillIfSelects(); renderLists(); syncForm(); showTab('model'); refresh();

$('#formPane').addEventListener('input', function(e){
  var el = e.target;
  if (el.dataset && el.dataset.port){
    var prow = el.closest('[data-list="vlanP"]'), pit = prow ? S.vlanP[Number(prow.dataset.i)] : null;
    if (!pit) return;
    var set = String(pit.ports||'').split(',').filter(Boolean).map(Number), pn = Number(el.dataset.port), ix = set.indexOf(pn);
    if (el.checked && ix<0) set.push(pn); else if (!el.checked && ix>=0) set.splice(ix,1);
    set.sort(function(a,b){ return a-b; }); pit.ports = set.join(','); refresh(); return;
  }
  if (el.dataset && el.dataset.k){ onField(el); return; }
  var row = el.closest ? el.closest('[data-list]') : null;
  if (row && el.dataset.f){
    var list = S[row.dataset.list], item = list[Number(row.dataset.i)];
    if (!item) return;
    item[el.dataset.f] = el.type==='checkbox' ? (el.checked ? '1' : '0') : el.value;
    if (el.dataset.f==='remoteType'){
      var ipEl = $('[data-f="remoteIp"]', row); if (ipEl) ipEl.disabled = el.value==='any';
    }
    if (el.dataset.f==='proto'){
      var esp = el.value==='esp';
      $$('[data-f="outer"],[data-f="inner"]', row).forEach(function(x){ x.disabled = esp; });
    }
    refresh();
  }
});
$('#formPane').addEventListener('change', function(e){
  var el = e.target;
  if (el.dataset && el.dataset.k && (el.type==='checkbox' || el.type==='radio' || el.tagName==='SELECT')) return; /* handled by input */
});
$('#formPane').addEventListener('click', function(e){
  var t = e.target;
  var tabBtn = t.closest ? t.closest('.tab') : null;
  if (tabBtn){ showTab(tabBtn.dataset.tab); return; }
  var del = t.closest ? t.closest('[data-act="del"]') : null;
  if (del){
    var row = del.closest('[data-list]');
    S[row.dataset.list].splice(Number(row.dataset.i),1);
    renderLists(); refresh(); return;
  }
  var pre = t.closest ? t.closest('[data-preset]') : null;
  if (pre){
    var p = PRESETS[Number(pre.dataset.preset)];
    S.forwards.push({proto:p.proto,outer:'',ip:'',inner:p.inner});
    renderLists(); refresh();
    var ip = $('#fw-'+(S.forwards.length-1)+'-ip'); if (ip) ip.focus();
    return;
  }
  if (t.id==='btnAddFw'){ S.forwards.push({proto:'tcp',outer:'',ip:'',inner:''}); renderLists(); refresh(); var a=$('#fw-'+(S.forwards.length-1)+'-ip'); if(a) a.focus(); return; }
  if (t.id==='btnAddRt'){ S.routes.push({dest:'',gw:''}); renderLists(); refresh(); var b=$('#rt-'+(S.routes.length-1)+'-dest'); if(b) b.focus(); return; }
  if (t.id==='btnAddVp'){
    var Mv = modelById(S.model), maxP = Mv.vlanStyle==='flex' ? 5 : Mv.ports[0].n-1;
    if (S.vlanP.length>=maxP){ toast('この機種で追加できるVLANは'+maxP+'つまでです。'); return; }
    S.vlanP.push({ip:'192.168.'+(101+S.vlanP.length)+'.1',prefix:'24',ports:'',dhcp:'1'}); renderLists(); refresh();
    var v3=$('#vp-'+(S.vlanP.length-1)+'-ip'); if (v3) v3.focus(); return;
  }
  if (t.id==='btnAddVt'){
    if (S.vlanT.length>=8){ toast('VLANは8つまで追加できます。'); return; }
    S.vlanT.push({vid:String(10*(S.vlanT.length+1)),ip:'192.168.'+(101+S.vlanT.length)+'.1',prefix:'24',dhcp:'1'}); renderLists(); refresh();
    var v4=$('#vt-'+(S.vlanT.length-1)+'-vid'); if (v4) v4.focus(); return;
  }
  if (t.id==='btnAddVs'){
    if (S.vpnS.length>=8){ toast('拠点は8つまで追加できます。'); return; }
    S.vpnS.push({remoteType:'fixed',remoteIp:'',remoteNet:'',psk:''}); renderLists(); refresh();
    var v1=$('#vs-'+(S.vpnS.length-1)+'-ip'); if (v1) v1.focus(); return;
  }
  if (t.id==='btnAddL2u'){
    if (S.l2tpUsers.length>=10){ toast('ユーザーは10人まで追加できます。'); return; }
    S.l2tpUsers.push({u:'',p:''}); renderLists(); refresh();
    var v2=$('#l2u-'+(S.l2tpUsers.length-1)+'-u'); if (v2) v2.focus(); return;
  }
  if (t.id==='btnAutoPool'){ if (!autoPool()) toast('LANのIPアドレスとプレフィックス長を先に正しく入力してください。'); refresh(); return; }
  if (t.id==='btnAutoRange'){ S.dhcpAuto = true; if (!autoRange()) toast('LANのIPアドレスとプレフィックス長を先に正しく入力してください。'); refresh(); return; }
});
$('#tabs').addEventListener('keydown', function(e){
  if (e.key!=='ArrowRight' && e.key!=='ArrowLeft') return;
  var i = TABS.map(function(t){return t.id;}).indexOf(curTab);
  i = (i + (e.key==='ArrowRight' ? 1 : TABS.length-1)) % TABS.length;
  showTab(TABS[i].id); $('#t-'+TABS[i].id).focus(); e.preventDefault();
});
$('#maskPw').addEventListener('input', function(e){ S.maskPw = e.target.checked; renderOut(); save(); });
$('#btnCopy').addEventListener('click', copyConfig);
$('#issues').addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('.issue') : null;
  if (!b) return;
  showTab(b.dataset.tab);
  setView('form');
  var pane = $('#formPane'); if (pane.scrollIntoView) pane.scrollIntoView({block:'start'});
});
$('#switchBar').addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('button') : null;
  if (b) setView(b.dataset.view);
});
$('#btnReset').addEventListener('click', function(){
  var btn = $('#btnReset');
  if (!btn.classList.contains('arm')){
    btn.classList.add('arm'); btn.textContent = 'もう一度押すと初期化します';
    clearTimeout(armTimer); armTimer = setTimeout(function(){ btn.classList.remove('arm'); btn.textContent = '入力を初期値に戻す'; }, 3500);
    return;
  }
  clearTimeout(armTimer); btn.classList.remove('arm'); btn.textContent = '入力を初期値に戻す';
  S = defaults(); fillIfSelects(); renderLists(); syncForm(); refresh();
  toast('入力を初期値に戻しました。');
});
})();
