# WeAppDev plugins

A plugin is **one HTML file** (or a zip when it ships assets). Logic code runs in the mini-program's
logic layer, render code runs in the page, and the HTML body is the panel UI in the host's floating
WebView.

Plugins are the durable way to modify behaviour: they survive app restarts, can be enabled per appid,
and ship through the in-app market.

## Minimal plugin

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="wad:package"     content="hello-probe">
  <meta name="wad:name"        content="Hello probe">
  <meta name="wad:version"     content="1.0.0">
  <meta name="wad:description" content="Logs attach and echoes a string">
</head>
<body>
  <h3>Hello probe</h3>
  <button onclick="run()">Ping logic layer</button>
  <pre id="out"></pre>

  <!-- runs in the logic layer (has wx, no DOM) -->
  <script type="text/wad-logic">
    wad.on('attach', function (appid) { wad.log('attach ' + appid); });
    wad.register('echo', function (s) { return 'echo:' + s; });
  </script>

  <!-- runs in the panel (has wad, no wx, no page DOM) -->
  <script>
    async function run() {
      const r = await wad.logic.call('echo', 'hi');
      document.getElementById('out').textContent = String(r);
    }
  </script>
</body>
</html>
```

## Required metadata

| Meta | Required | Notes |
|---|---|---|
| `wad:package` | yes | unique package id, `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`; the update key |
| `wad:name` | no | display name |
| `wad:version` / `wad:versionCode` | no | version name / integer for update decisions |
| `wad:author`, `wad:description`, `wad:logo` | no | shown in the plugin list (`logo` may be a data URL or a zip asset name) |

README: a `README.md` at the zip root, or `<script type="text/markdown">` inside the HTML.

Hard limits: inline scripts are syntax-checked before install (`E_SYNTAX` blocks the install), the
HTML must stay under 2MB, each of `wad-logic` / `wad-render` under 256KB, at most 40 enabled plugins,
and one bus message under 256KB. All code runs in its own IIFE; a plugin that throws twice is not
injected again in that generation.

## API surface by context

| Capability | logic | render | panel |
|---|---|---|---|
| `wad.id / name / version / appid` | yes | yes | yes |
| `wad.log(...)` | yes | yes | yes |
| `wad.on / off / emit` | yes | yes | yes |
| `wad.register(fn, handler)` | yes | — | — |
| `wad.logic.call(fn, args)` | sync | Promise | Promise |
| `wad.logic.eval(expr)` | yes | — | Promise |
| `wad.render.eval(expr)` | fire-and-forget | yes | Promise |
| `wad.render.dom(fn)` | — | yes | — |
| `wad.http.get/post/request` | yes (`wx.request`) | — | yes (host-proxied) |
| `wad.storage.get/set/remove/keys` | yes | — | yes |
| `wad.net.records / addRule / removeRule / rules` | yes | — | yes |
| `wad.ws.list / frames / send / recv / close / block / rewrite` | yes | — | yes |
| `wad.ui.toast / setTitle / close / setSize` | toast | DOM toast | shell/host |
| `wad.page()` | yes | — | — |

Logic-layer injection lands in the business context (`WxaSub-*`), not `MainContext`. Plugin storage
is namespaced (`__wad_<pluginId>_`) so it cannot collide with mini-program keys.

## Return values

Return **JSON-serialisable** values. A returned object is stringified by the bus as
`[object Object]`; if the panel needs structured data, `JSON.stringify` in the handler and parse in the
panel. Promises returned from a logic handler are treated as `null`.

## Lifecycle events

| Event | Fires when | Payload |
|---|---|---|
| `attach` | plugin injected into a mini-program context | appid |
| `detach` | plugin disabled/uninstalled/app switched | appid |
| `pageChange` | route changed | `{route, options, appid}` |
| `storageWrite` | mini-program wrote storage via `wx.*Storage*` | `{op, key, value, plugin}` |
| `network` | HTTP/WS summary captured | `{url, method, status, kind, ws, dir, len, id, at}` |
| `nativeReq` | before a JSAPI request is sent (modifiable) | `{api, appid, seq, body, transformed}` |
| `nativeResp` | synchronous JSAPI response (modifiable) | `{api, appid, seq, body, reqBody, gwKey}` |
| custom | `wad.emit(name, data)` | anything |

`nativeReq` / `nativeResp` come from the native relay and are **not** gated by the Native page capture
switch.

## Recipes

### Rewrite a response field

```js
wad.on('network', function () {});           // subscribe first (see note below)
wad.on('nativeResp', function (d) {
  var o = JSON.parse(d.body);
  if (o.data && o.data.vip === 0) { o.data.vip = 1; return o; }
  // return nothing → leave unchanged
});
```

Returning an object (or JSON string) replaces the body. Chained across plugins.

### Intercept and block a WebSocket frame

```js
wad.ws.rewrite(sessionId, 'send', 'gold', 'gem');   // literal replace
wad.ws.block(sessionId, 'send');                     // nothing leaves
wad.ws.send(sessionId, '{"cmd":"ping"}');            // send as the page
wad.ws.recv(sessionId, '{"result":"ok"}');           // deliver to onMessage
```

`wad.ws.list()` / `wad.ws.frames(id)` enumerate sessions and frames.

### Add a UI panel action

```html
<script>
async function apply() {
  const n = await wad.logic.eval('getCurrentPages().length');
  wad.logic.call('setFlag', true);
  wad.logic.emit('refresh', { n });
  wad.ui.toast('applied');
}
</script>
```

### Panel-only HTTP (no CORS, no domain whitelist)

```js
const r = await wad.http.request('POST', 'https://example.com/api', '{"a":1}');
// r = { status, headers, body, truncated }
```

## Full dev loop (write → install → debug → update) — MCP and REST side by side

**1. Write** the HTML (one file; metadata + `text/wad-logic` + panel `<script>`), keep
`wad:package` stable — it is the identity across versions.

**2. Install** (syntax-checked first; `E_SYNTAX` blocks the install without side effects):

```jsonc
// MCP
wad_install_plugin { "html": "<!doctype html>…full file…", "enable": true }
// REST — identical semantics
POST /v1/plugins/install   { "html": "…", "enable": true }
// REST — from URL (zip or html)
POST /v1/plugins/install-url { "url": "https://example.com/plugin.html", "sha256": "…" }
```

**3. Debug** — three layers, each with its own tool:

```jsonc
wad_list_plugins { "enabled": "all" }                          // is it installed/enabled?
wad_plugin { "action": "state" }                               // did it inject? which contexts?
wad_plugin { "action": "logs", "id": "hello-probe", "args": { "tail": 80 } }   // its own logs
wad_debug { "action": "get_contexts" }                          // logic-layer context alive?
wad_debug { "action": "evaluate", "params": { "expression": "typeof wad" } }   // injected into logic?
wad_plugin { "action": "evaluate", "id": "hello-probe", "args": { "code": "document.title" } }  // panel
wad_plugin { "action": "panel_open", "id": "hello-probe" }      // visual check
// REST equivalents: GET /v1/plugins/{id} · GET /v1/plugins/logs?id=… · POST /v1/plugins/render-eval
```

**4. Update** = reinstall the **same `wad:package`** with a bumped `wad:versionCode` — install
replaces in place and re-injects into the current mini-program:

```jsonc
// bump  wad:version 1.0.0 → 1.0.1  (wad:versionCode 1 → 2)  then:
wad_install_plugin { "html": "<!doctype html>…v1.0.1…", "enable": true }
wad_plugin { "action": "reload", "id": "hello-probe" }          // force re-inject without reopening the app
```

**5. Enable/disable/remove**:

```jsonc
wad_plugin { "action": "set_enabled", "id": "hello-probe", "args": { "enabled": false } }
wad_plugin { "action": "uninstall", "id": "hello-probe" }
// REST: POST /v1/plugins/{id} {enabled:false} · DELETE /v1/plugins/{id}
```

Pitfalls measured in practice: a nested `html` passed through MCP must be the **flat string
argument** (no wrapper object); a plugin that throws twice in one generation is not re-injected
until `reload`; and logic-layer injection lands in `WxaSub-*` — `wad_debug` must target that
context, not `MainContext`.

## Command quick reference

```
wad_install_plugin { "html": "<!doctype html>…", "enable": true }
wad_install_plugin { "url": "https://example.com/plugin.html", "sha256": "<optional>" }
wad_install_plugin { "path": "/sdcard/Download/plugin.zip", "enable": true }

wad_list_plugins { "enabled": "all" }
wad_plugin { "action": "set_enabled", "id": "<pluginId>", "args": { "enabled": true } }
wad_plugin { "action": "reload", "id": "<pluginId>" }
wad_plugin { "action": "logs", "id": "<pluginId>", "args": { "tail": 80 } }
wad_plugin { "action": "uninstall", "id": "<pluginId>" }
```

Install performs a syntax pre-check and returns `E_SYNTAX` without writing anything on failure.

`wad_plugin { action: "logs" }` filters by `id` **before** truncating, so a chatty neighbour plugin
cannot hide your output. If your logs are missing, the plugin probably never injected — check
`wad_plugin { action: "state" }` and that the mini-program logic layer is alive.

## The in-app panel

```
wad_plugin { "action": "panel_open",  "id": "<pluginId>" }
wad_take_snapshot { "layer": "panel", "maxNodes": 60 }
wad_dom { "action": "html", "layer": "panel" }
wad_plugin { "action": "panel_list" }
wad_plugin { "action": "panel_close", "id": "<pluginId>" }
wad_plugin { "action": "evaluate", "id": "<pluginId>", "args": { "code": "document.title" } }
```

The panel is a system WebView; it does not share the XWeb devtools socket, so panel DOM access goes
through the in-process JS bridge. Panel screenshots can hang — use a panel snapshot.

## Debugging a plugin

| Symptom | Likely cause |
|---|---|
| `E_SYNTAX` on install | a syntax error in any inline script (the whole file is pre-checked) |
| Plugin installed but no `attach` | mini-program logic layer not running, or CDP debug service off |
| `wad.logic.call` rejects | handler not registered (`wad.register` runs in the logic layer, not the panel) |
| Panel opens blank | an exception in the panel script before first render; check `wad_plugin logs` |
| Handler returns `[object Object]` | return a JSON string instead of an object |
| Native hooks do nothing | `native.*` phases need a plugin; `wad_hooks` covers only net/logic |

## Packaging for distribution

```
zip -r my-plugin.zip plugin.html assets/ README.md logo.png
```

Zip root must contain the HTML (any name) plus optional `README.md`, `logo.png` and assets referenced
by relative paths. The market entry uses `wad:package` as the identity, so keep it stable across
versions and bump `wad:versionCode` to let users see updates.

## Related

- [native-capture.md](native-capture.md) — the envelope hooks that `nativeReq`/`nativeResp` expose
- [websocket.md](websocket.md) — `wad.ws.*` semantics from the MCP side
- [tools.md](tools.md) — `wad_plugin` parameters
