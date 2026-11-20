---
name: weappdev
description: Debug, reverse-engineer, and automate Android WeChat mini-programs through the WeAppDev MCP server. Use when the user wants to capture mini-program network or native traffic, recover signing/encryption algorithms, set breakpoints and inspect paused state, read cloud-development calls, intercept WebSocket frames, drive the UI (snapshot/click/fill/screenshot), call cloud APIs purely by protocol (gateway/container/function/login-code/HostSign), or build a WeAppDev plugin. Also use when the user mentions WeAppDev, wad_* tools, WMPF, mini-program reversing.
license: MIT
compatibility: "Works in three modes. (1) Phone-direct MCP or the phone's REST API Server (port 9400): no local dependencies at all — works from desktop AI tools AND Android on-device AI agents (e.g. Rikkahub) that speak MCP. (2) Studio aggregator MCP: needs Node.js 22+ (npx). (3) Shell helpers: optional; check scripts exist in .py / .js / .sh so any environment can run one. Never install a runtime just to use this skill — pick the mode that fits."
metadata:
  version: "1.0.0"
  upstream: https://github.com/RYF5584/weappdev-mcp
  app-tools: "64"
---

# WeAppDev

WeAppDev is an Android app that hosts WeChat mini-programs outside WeChat and exposes a full CDP
debugger plus a 64-tool MCP server (apiLevel 100). Everything below is done by calling **MCP tools**;
you never need `adb` for debugging (only to physically connect the phone).

## 0. Which page do you need?

Read only the reference that matches the task. Every file is self-contained.

| The user wants to… | Read |
|---|---|
| Connect, pick a phone, understand direct vs aggregator, fix "no device" | [reference/connection.md](reference/connection.md) |
| Reverse a signing/encryption algorithm, find where a request is built | [reference/reverse-engineering.md](reference/reverse-engineering.md) |
| Capture and inspect HTTP requests/responses, replay them, rewrite them | [reference/network-capture.md](reference/network-capture.md) |
| Inspect cloud-development traffic (`cloud.callFunction`, containers, gateway V3) | [reference/cloud-capture.md](reference/cloud-capture.md) |
| **Call cloud dev (gateway / container / function / any tcbapi) purely by protocol** | [reference/pure-protocol.md](reference/pure-protocol.md) |
| Get `wx.login` code / user-encryption key / plugin HostSign **without opening** the app | [reference/pure-protocol.md](reference/pure-protocol.md) |
| Interpret `-12030` / `-12028` / `61010` risk codes; judge `-103006` (usually your params, rarely the app) | [reference/pure-protocol.md](reference/pure-protocol.md) |
| Inspect the native JSAPI layer, decrypt native envelopes, hook/modify them | [reference/native-capture.md](reference/native-capture.md) |
| Intercept, send, block or rewrite WebSocket frames | [reference/websocket.md](reference/websocket.md) |
| Drive the UI: snapshot, click, fill, scroll, screenshot, wait | [reference/automation.md](reference/automation.md) |
| Write / install / debug / **update** a WeAppDev plugin (full dev loop, MCP + REST examples) | [reference/plugins.md](reference/plugins.md) |
| Install/enable/disable **network rewrite scripts** or **cloud-dev scripts** | [reference/network-capture.md](reference/network-capture.md#scripts) |
| Pre-inject bootstrap JS into a mini-program at script-exec time (business scope) | [reference/reverse-engineering.md](reference/reverse-engineering.md#preload) |
| Look up a tool's exact parameters, or see all 64 tools | [reference/tools.md](reference/tools.md) |
| Diagnose an error code or a weird result; **MCP vs REST argument-shape pitfalls** | [reference/troubleshooting.md](reference/troubleshooting.md) · [reference/connection.md](reference/connection.md) |
| Copy a ready-made call sequence | [examples/](examples/) |

## 0.5 When to use the pure-protocol plane (/ilink)?

Use **runtime capture + rewrite** when you need to *observe or modify what the running mini-program
sends*. Use the **pure-protocol plane** (`wad_ilink`, REST `POST /v1/ilink/*`) when you need the
*result of a WeChat/cloud API without opening the mini-program* — protocol-level collection,
server-side scripts, batch verification. The mapping from the official client APIs:

| In the mini-program you would call… | Pure-protocol equivalent | Notes |
|---|---|---|
| `wx.login()` — need a login code | `wad_ilink {action:"js-login"}` | code ≈5 min, single-use. Auto-heals `61010` once. |
| `wx.getUserCryptoManager().getLatestUserKey()` ([docs](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/user-encryptkey.html)) | `wad_ilink {action:"get-user-encrypt-key"}` | `encrypt_key`+`iv` for decrypting `encryptedData` / building the encrypted channel |
| Plugin request header `X-WECHAT-HOSTSIGN` ([docs](https://developers.weixin.qq.com/miniprogram/dev/framework/plugin/development.html)) | `wad_ilink {action:"verify-plugin"}` | body `plugins:[{provider, inner_version}]`; returns `host_sign/noncestr/timestamp` |
| `wx.cloud.services.Gateway({domain}).call(...)` / `wx.cloud.gateway.call(...)` | `wad_ilink {action:"get-cloud-gateway-v3-token-key"}` for V3 credentials, or `js-operate-wx-data(-by-api)` with `tcbapi_call_gateway` for native direct | two channels, see [reference/pure-protocol.md](reference/pure-protocol.md) |
| `wx.cloud.callContainer(...)` / `new wx.cloud.Cloud({resourceAppid, resourceEnv})` | `wad_ilink {action:"get-cloud-container-token-key"}` for HTTP credentials, or `js-operate-wx-data(-by-api)` with `tcbapi_call_container` | two channels, same page |
| `wx.cloud.callFunction(...)` → `tcbapi_slowcallfunction_v2` | `wad_ilink {action:"js-operate-wx-data-by-api"}` | bind env auth first (`tcbapi_getenvauth`) |
| any other cloud-dev API (`tcbapi_*`: database, storage, …) | `wad_ilink {action:"js-operate-wx-data(-by-api)"}` | **every Native-layer `tcbapi_*` travels through jsop**, so the protocol plane can replay any of them |

Rule of thumb: if the user asks for pure-protocol access, protocol-level collection without
opening the mini-program, direct request replay, batch collection, or server-side calls, you are
in pure-protocol territory → read [reference/pure-protocol.md](reference/pure-protocol.md).
(User phrasing may be Chinese; match by intent, not literal keywords.)

## 1. First three calls (always)

```
wad_devices                      # which phones are reachable, and their versions
wad_device_use { device: "<alias>" }   # pin one for this session (skip if only one)
wad_status                       # confirm app / mini-program / capture state
```

`wad_status` answers: is a mini-program running, is its logic layer alive, is a render target
present, which appId is in front, what is capturing. **Do not skip it** — most confusing failures
are "no mini-program open yet".

If the user connected **directly to the phone** (URL-based MCP config), `wad_devices` and
`wad_device_use` do not exist and `device` is not a parameter. In that mode you are already talking
to exactly one phone. See [reference/connection.md](reference/connection.md).

**If nothing connects — no device found, calls time out, MCP unreachable — do not debug blindly:
ask the user for the WeAppDev phone's IP and port** (on the phone: WeAppDev → Dev config shows the
bound address; default port 9400, but the app may have fallen forward to 9401/…, so take the port
it actually displays). Then either reconfigure the MCP endpoint (`http://<ip>:<port>/mcp`) or, on
the aggregator, `wad_device_use { device: "http://<ip>:<port>" }`. Sanity-check with
`curl http://<ip>:<port>/v1/status` first — full flow in
[reference/connection.md](reference/connection.md#connection-fails-ask-the-user-for-the-phone-address-first).

## 2. The five core habits

1. **Open before you poke.** `wad_open_app { appid }` then `wad_status` until
   `apps[].logic === true`. Half the "tool returns nothing" cases are an app that never finished
   starting. After a `hard` restart the first launch may outlive the verify window — a second
   `wad_open_app` converges (the tool is idempotent).
2. **Snapshot before you click.** `wad_take_snapshot { layer: "render" }` returns a `rev` and node
   `uid`s. Pass both to `wad_click` / `wad_fill`. A stale `rev` yields `E_STALE_UID`, which means
   "re-snapshot", not "retry blindly".
3. **One mini-program at a time.** The container hosts a single instance. Switching apps needs
   `wad_app { action: "restart", appid, hard: true }`; otherwise the previous app keeps the
   inspector and your calls hit the wrong page.
4. **Read the `hint`.** Tool errors carry `{code, message, retryable, hint}`. The hint is written to
   tell you the next call to make; honour it instead of retrying the same request.
5. **Never guess at behaviour you can observe.** `wad_search_scripts` / `wad_list_network_requests`
   give ground truth. Do not invent endpoint names or parameter shapes.

Sequences in `examples/` assume you already ran `wad_status` and saw `logic: true`; their
`appid` is a placeholder — substitute the target; `device` exists only on the aggregator, drop it
on a direct connection.

## 3. What each tool group is for

| Group | Tools | Purpose |
|---|---|---|
| core | `wad_status`, `wad_capabilities`, `wad_help`, `wad_tools`, app/account/settings, snapshot/click/fill/eval/screenshot, network list, console, wait, batch, api | everyday control |
| reverse | script listing/source/search, API radar, breakpoints, stepping, paused state, initiator, WebSocket, hooks | finding and stopping at the interesting code |
| debug | `wad_debug` | one tool with every debugger action (contexts, scopes, evaluate on frame) |
| render | `wad_dom`, `wad_interact` | DOM inspection and input injection |
| network | `wad_network`, `wad_http` | rules, replay, sitemap, and arbitrary requests through the mini-program's own stack |
| cloud | `wad_cloud`, `wad_ilink` | cloud capture + the pure-protocol plane (see §0.5) |
| native | `wad_native`, `wad_capture` | native JSAPI traffic, credentials, envelope decoding |
| plugins | `wad_plugin` | plugin lifecycle and the in-app panel |
| files | `wad_files`, `wad_storage`, `wad_events` | read/download artifacts, mini-program storage, event stream |
| account/app | `wad_account`, `wad_app` | accounts, restarts, verify popups |
| cdp | `wad_cdp` | raw CDP when no wrapper exists |

Full parameters: [reference/tools.md](reference/tools.md).

## 4. Which mode am I in? (and what do I need installed?)

| Mode | How you connected | Needs Node? | Notes |
|---|---|---|---|
| **Phone-direct MCP** | MCP config pointing at the phone's `http://<phone>:9400/mcp` | **No** | full 64-tool set; works from desktop clients AND Android AI agents (e.g. Rikkahub) |
| **REST API Server** | plain HTTP to `http://127.0.0.1:9400/v1/*` (or LAN phone IP) | **No** | everything the MCP does is also a REST route; Swagger at `/docs` |
| **Studio aggregator MCP** | `npx @ryf5584/weappdev-mcp` style config | **Yes (22+)** | adds multi-device (`wad_devices`/`wad_device_use`) and forwards the rest to the phone |

If you are an on-device Android agent there is no `adb`, no Node, no shell — that is fine: the
phone-direct MCP and the REST API are fully self-sufficient. `wad_tools {action:"list"}` asks the
phone what it supports; `wad_api` lets you hit any `/v1` route directly when no wrapper tool exists.

## 5. Versions and compatibility

Two numbers matter and they are not the same:

- `version` (semver) — human-readable only. Phone MCP server, Studio aggregator and this skill are
  all **1.0.0**; the Android app itself ships as **1.1.0** (versionCode 110).
- `apiLevel` (integer) — the **only** input to compatibility decisions. Current generation: **100**
  on phone, aggregator and catalog alike.

**Phone newer than the aggregator (the common case after an app update):** the phone's extra tools
are NOT lost — the aggregator forwards any name it does not know through the `wad_tools` meta tool:

```jsonc
wad_tools { action: "list" }                                  // what the phone really supports right now
wad_tools { action: "list", search: "ilink" }                 // filtered
wad_tools { action: "describe", name: "wad_some_new_tool" }   // full schema of a tool missing locally
wad_tools { action: "call", name: "wad_some_new_tool", args: { } }  // run it (arguments stay FLAT)
```

**Aggregator newer than the phone:** a call may return `E_UNSUPPORTED_BY_DEVICE`; the message names
the phone's version — update the app on the phone. Trust `wad_tools { action: "list" }` over any
cached list.

## 5.5 Key facts at a glance

- 64 tools, apiLevel 100, server version 1.0.0 — the same set on Studio MCP and phone-direct MCP.
- One port hosts everything: `/mcp` (MCP), `/v1/*` (REST), `/docs` (Swagger), `/devtools/*` + `/json/*` (CDP).
- The container hosts **one** mini-program at a time; switching apps = `wad_app {action:"restart", hard:true}`;
  the first open after a kill can outlive the verify window — call `wad_open_app` once more (it is
  idempotent and now retries once itself).
- MCP tool arguments are **flat**; REST bodies are the whole envelope. Nested wrappers silently lose
  fields (see [reference/connection.md](reference/connection.md)).
- Pure-protocol calls return `{ok, code, category, retryable, message, data}` — read `category`
  before retrying anything (risk / usage-record / upstream).
- Screenshot coordinates equal click coordinates (`wad_interact click_at` takes physical px);
  mini-games use the PixelCopy path and still match (§10).
- Network/cloud rewrite scripts are **return-value** hooks — `return req;` / `return res;` or the
  rewrite is silently dropped (§9).

## 6. Safety and scope

- These tools only touch the mini-program running inside WeAppDev on a device the user controls.
- Prefer read-only discovery first (`list`, `get`, `status`) before anything that changes state.
- `wad_set_breakpoint_on_text` with an `action` runs code **inside the mini-program**; state it
  explicitly before doing it and clean up with `wad_remove_breakpoint { all: true }` afterwards.
- Restarting with `wad_app { hard: true }` kills the runtime process; mention that it will interrupt
  the session.

## 7. Scripts (optional helpers — every environment has a fitting one)

All helpers do the same thing: check the environment and let you call MCP/REST from a shell.
**They are optional** — in phone-direct mode you don't need any of them.

- [scripts/check_env.py](scripts/check_env.py) — environment check, Python 3 stdlib only (Windows / Linux / macOS).
- [scripts/check-env.sh](scripts/check-env.sh) — environment check, POSIX shell (Linux / macOS).
- [scripts/check-env.mjs](scripts/check-env.mjs) — environment check, Node 18+ (only when Node is already there).
- [scripts/mcp_call.py](scripts/mcp_call.py) — call any MCP tool from the shell, Python stdlib only.
- [scripts/mcp-call.mjs](scripts/mcp-call.mjs) — call any MCP tool from the shell, Node 18+.

Pick whichever interpreter the machine already has. Never install a runtime for these.

## 8. Pure-protocol plane (/ilink) — quick recipes (all measured on device)

`wad_ilink` (or `POST /v1/ilink/<name>`) talks to WeChat CGI endpoints **directly from Rust** with
the current account session — no container, no capture, works with no mini-program open. Every
call returns `{ok, code, category, retryable, message, data}` with **plaintext** business fields
(never base64). Deep templates: [reference/pure-protocol.md](reference/pure-protocol.md) ·
full walkthroughs: [examples/cloud-dev-protocol.md](examples/cloud-dev-protocol.md).

### 8.1 `wx.login()` → `js-login`

```
wad_ilink { "action": "js-login", "appid": "wxBBBBBBBBBBBBBBBB" }
```
```jsonc
// → { "ok":true, "code":0, "data":{ "code":"0b3SampleCodeSampleSample12SampleCodE", ... } }
// data.code ≈ 5 min, single-use. On 61010 (code expired) it auto-heals once:
// internally adds the app to the account's recent-usage list, then retries (see data.healed).
```

### 8.2 `wx.getUserCryptoManager().getLatestUserKey()` → `get-user-encrypt-key`

```
wad_ilink { "action": "get-user-encrypt-key", "appid": "wxBBBB…" }
```
```jsonc
// → data.payload = { encrypt_key, iv, version, expire_in, create_time }
// Decrypts encryptedData / seeds the session encryption channel.
```

### 8.3 plugin `X-WECHAT-HOSTSIGN` → `verify-plugin`

```
wad_ilink { "action": "verify-plugin", "appid": "wxCCCC…",
            "plugins": [ { "provider": "wxDDDD…", "inner_version": 4 } ] }
```
```jsonc
// provider = the PLUGIN's appId, inner_version = integer. Measured response:
// → data.payload.list[0] = { plugin_id, host_sign:"23a10c4f…", noncestr:"3ff5…",
//                            timestamp:1700000000, request_domain:[…], banning:{hint:""} }
```

### 8.4 cloud function (`wx.cloud.callFunction`) → getenvauth + `slowcallfunction`

Two steps — **skip step 1 and the call "succeeds" with an empty body**:

```jsonc
// step 1: bind env auth
wad_ilink { "action": "js-operate-wx-data-by-api", "appid": "wxBBBB…",
            "qbase_api_name": "tcbapi_getenvauth", "data": { "env": "cloud1-XXXXXXXX" } }

// step 2: call the function (data is DOUBLE-stringified)
wad_ilink { "action": "js-operate-wx-data-by-api", "appid": "wxBBBB…",
            "qbase_api_name": "tcbapi_slowcallfunction_v2",
            "data": { "function_name": "myFn",
                      "data": "{\"action\":\"getList\",\"month\":\"2026-11\"}",
                      "action": 1, "scene": 1,
                      "call_id": "<ms>-0.<rand>", "cloudid_list": [] },
            "env": "cloud1-XXXXXXXX" }
```
```jsonc
// → data.dataParsed = {"code":0,"message":"ok","data":{ …plaintext business result… }}
```

### 8.5 gateway (`wx.cloud.services.Gateway`) → V3 credential or native `tcbapi_call_gateway`

```
// V3 HTTP route — take the credential, then send encrypted HTTP yourself:
wad_ilink { "action": "get-cloud-gateway-v3-token-key", "appid": "wxAAAA…",
            "domain": "abc123-wxXXXXXX.sh.wxcloudrun.com" }
// → data.credential = { token, key, iat, exp, rid }  → wxcloud-gateway-sdk (Python)

// Native direct route — the whole gateway call is one qbase envelope (measured):
wad_ilink { "action": "js-operate-wx-data", "appid": "wxAAAA…",
            "api_name": "qbase_commapi",
            "data": { "qbase_api_name": "tcbapi_call_gateway",
                      "qbase_req": "{\"method\":\"post\",\"headers\":[
                         {\"k\":\"content-type\",\"v\":\"application/json\"},
                         {\"k\":\"X-WX-HTTP-MODE\",\"v\":\"REROUTE\"},
                         {\"k\":\"User-Agent\",\"v\":\"<Android MiniProgram UA — must match get_service_info device, else WAF 403>\"},
                         {\"k\":\"X-WX-HTTP-HOST\",\"v\":\"abc123-wxXXXXXX.sh.wxcloudrun.com\"},
                         {\"k\":\"X-WX-HTTP-PATH\",\"v\":\"https://biz.example.cn/base/location/getLocation\"}],
                       \"data\":\"{\\\"lon\\\":12.34}\",\"data_type\":0,\"action\":1,
                       \"retryType\":0,\"call_id\":\"v2-<ms>-<8rand>_\",\"user_timeout\":60000}",
                      "qbase_options": { "rid": "<…>-<ms>-<…>", "rv": "2" },
                      "qbase_meta": { "session_id": "<ms>",
                                      "sdk_version": "wx-miniprogram-sdk/3.16.2 (<ms> platform/android})" },
                      "cli_req_id": "<ms>_0.<16rand>" },
            "operate_directly": false, "env": 1 }
// headers is an ARRAY of {k,v}; X-WX-HTTP-PATH = the FULL business URL; fresh timestamps each send.
// → data.dataParsed = plaintext business response.
```

**The same shape covers `tcbapi_call_container` (cloud-run) and every other Native-layer
`tcbapi_*` — they all travel through jsop, so all of them can be replayed by protocol.**

### 8.6 risk codes at a glance

| `code` | Meaning | Action |
|---|---|---|
| `-12030` | account-level risk control (everything unopenable via protocol; WeChat client fine) | cooldown / switch account |
| `-12028` | app-level risk control (temporary throttle usually recovers; permanent is rare) | wait; if another account also gets it, fall back to runtime capture |
| `61010` | code expired — app not in recent-usage list | `js-login` auto-heals once; manual: `update-wxa-usage-record` |
| `-103006` | **almost always your params** (field name / escaping / stale ids / missing getenvauth / headers as map) — diff against a fresh capture of the same app. Rarely: that app's backend rejects the protocol path; last resort, not the first explanation | fix the request |

## 9. Rewrite-script contracts (measured on device — read before writing any script)

**Network scripts** (`/v1/rewrite/scripts`, content field): `onRequest(req)` /
`onResponse(res)` are **return-value rewrite** hooks. Mutating the argument alone is
silently ignored — you must `return req;` / `return res;`:

```js
function onRequest(req){ req.url += (req.url.indexOf('?')>=0?'&':'?')+'x=1'; return req; }   // ✓
function onResponse(res){ res.data.msg='WAD'; return res; }                                  // ✓
function onRequest(req){ req.url='...'; }   // ✗ silently ignored (no return)
```

**Cloud scripts** (`/v1/cloud/scripts`): hooks are also named `onRequest`/`onResponse`
(**not** onCloudRequest/onCloudResponse), and the response field is the callback view's
`res.resp` (not `res.result`): `function onResponse(res){ res.resp._wad=1; return res; }`.
Response rewrite goes through the native cloud-capture layer — enable
`POST /v1/capture/cloud {"on":true}` first; for instant in-JS rewriting of
`wx.cloud.callFunction` use a plugin instead (wrap `wx.cloud.callFunction`).

## 10. Mini-game note (native canvas)

Mini-games have **no XWeb render target**: `wad_take_screenshot` returns
`E_NO_RENDER_TARGET` immediately (use element/state probing instead), and UI driving
uses container-process native touch injection (`wad_interact click_at`, physical px =
screenshot px). Cocos games expose `cc` in a `WxaSub-*` context once sub-context
registration has run — pick it with `wad_debug {action:"get_contexts"}` and probe
`typeof cc` per context.
