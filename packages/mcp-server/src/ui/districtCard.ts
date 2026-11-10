/**
 * MCP Apps UI resource for the District snapshot card (spike #2605).
 *
 * A single self-contained HTML document (no external scripts, styles or
 * network calls, so it needs no CSP allowances). It speaks the MCP Apps
 * view<->host postMessage JSON-RPC dialect directly, with no
 * `@modelcontextprotocol/ext-apps` dependency:
 *   view -> host  ui/initialize (request), ui/notifications/initialized,
 *                 ui/notifications/size-changed, tools/call (refresh button)
 *   host -> view  ui/notifications/tool-result (carries structuredContent)
 * Spec: https://github.com/modelcontextprotocol/ext-apps (2026-01-26).
 * Values are written with textContent only, never innerHTML.
 */

export const MCP_APP_MIME = 'text/html;profile=mcp-app'
export const CARD_RESOURCE_URI = 'ui://toast-stats/district-card.html'

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#5c6470;--line:#d9dde3;--accent:#004165}
@media (prefers-color-scheme:dark){:root{--bg:#1b1d21;--fg:#f1f2f4;--muted:#a3a9b3;--line:#363a41;--accent:#7cb8e0}}
:root[data-theme=dark]{--bg:#1b1d21;--fg:#f1f2f4;--muted:#a3a9b3;--line:#363a41;--accent:#7cb8e0}
:root[data-theme=light]{--bg:#fff;--fg:#1a1a1a;--muted:#5c6470;--line:#d9dde3;--accent:#004165}
body{margin:0;padding:16px;font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:1.1rem;margin:0 0 2px}
.sub{color:var(--muted);font-size:.85rem;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.tile{border:1px solid var(--line);border-radius:8px;padding:10px}
.tile b{display:block;font-size:1.5rem;color:var(--accent)}
.tile span{color:var(--muted);font-size:.8rem}
.tile small{display:block;color:var(--muted);font-size:.8rem}
button{margin-top:12px;min-height:44px;padding:0 16px;border:1px solid var(--accent);border-radius:8px;background:transparent;color:var(--accent);font:inherit;cursor:pointer}
button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
`

const SCRIPT = `
(function(){
  var nextId = 1, pending = {}, current = null;
  var $ = function(id){ return document.getElementById(id) };
  function send(m){ window.parent.postMessage(m, '*') }
  function request(method, params){
    return new Promise(function(resolve){
      var id = nextId++; pending[id] = resolve;
      send({jsonrpc:'2.0', id:id, method:method, params:params});
    });
  }
  function notify(method, params){ send({jsonrpc:'2.0', method:method, params:params}) }
  function fmt(n){ return typeof n === 'number' ? n.toLocaleString() : 'n/a' }
  function render(c){
    if(!c || typeof c.districtId !== 'string'){ $('sub').textContent = 'No data for this district.'; return }
    current = c;
    $('title').textContent = 'District ' + c.districtId;
    $('sub').textContent = 'Snapshot ' + c.snapshotDate;
    $('clubs').textContent = fmt(c.totalClubs);
    $('members').textContent = fmt(c.membership);
    $('payments').textContent = fmt(c.payments);
    var d = c.distinguished;
    $('dist').textContent = d ? fmt(d.confirmed) : 'n/a';
    $('prov').textContent = d ? ('+' + fmt(d.provisional) + ' provisional') : 'not published';
    notify('ui/notifications/size-changed', {width: document.body.scrollWidth, height: document.body.scrollHeight});
  }
  window.addEventListener('message', function(e){
    var m = e.data;
    if(!m || m.jsonrpc !== '2.0') return;
    if(m.method === undefined && m.id !== undefined){
      var r = pending[m.id]; if(r){ delete pending[m.id]; r(m) } return;
    }
    if(m.method === 'ui/notifications/tool-result'){ render(m.params && m.params.structuredContent) }
  });
  $('refresh').addEventListener('click', function(){
    if(!current) return;
    request('tools/call', {name:'show-district-card', arguments:{districtId:current.districtId}}).then(function(res){
      if(res.result) render(res.result.structuredContent);
    });
  });
  request('ui/initialize', {
    protocolVersion:'2026-01-26',
    appCapabilities:{},
    clientInfo:{name:'toast-stats-district-card', version:'0.1.0'}
  }).then(function(res){
    var theme = res.result && res.result.hostContext && res.result.hostContext.theme;
    if(theme) document.documentElement.setAttribute('data-theme', theme);
    notify('ui/notifications/initialized', {});
  });
})();
`

/** The self-contained card document served at {@link CARD_RESOURCE_URI}. */
export function renderCardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>District snapshot</title><style>${STYLE}</style></head>
<body>
<h1 id="title">District snapshot</h1>
<div class="sub" id="sub">Waiting for data...</div>
<div class="grid">
<div class="tile"><b id="members">-</b><span>Membership</span></div>
<div class="tile"><b id="payments">-</b><span>Payments</span></div>
<div class="tile"><b id="clubs">-</b><span>Clubs</span></div>
<div class="tile"><b id="dist">-</b><span>Distinguished (confirmed)</span><small id="prov"></small></div>
</div>
<button id="refresh" type="button">Refresh</button>
<script>${SCRIPT}</script>
</body></html>`
}
