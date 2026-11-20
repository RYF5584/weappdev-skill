# Tool reference (64 tools)

Every tool returns `content[].text` plus `structuredContent` and `isError`. Errors are
`{ok, error, message, retryable, hint}`. List endpoints accept `limit` / `cursor` / `tail`.

On the **aggregator** every tool also takes an optional `device` (alias / uuid /
`http://host:port`), and two extra tools exist: `wad_devices`, `wad_device_use`.

Arguments are `name:type`; required ones are **bold**.

## Index

- **Core: status, apps, accounts, settings, elements, network reads, waiting** (27): `wad_status`, `wad_capabilities`, `wad_help`, `wad_list_apps`, `wad_open_app`, `wad_close_app`, `wad_list_recent`, `wad_list_accounts`, `wad_switch_account`, `wad_login_start`, `wad_login_poll`, `wad_get_settings`, `wad_set_settings`, `wad_list_plugins`, `wad_install_plugin`, `wad_take_snapshot`, `wad_click`, `wad_fill`, `wad_evaluate_script`, `wad_take_screenshot`, `wad_list_network_requests`, `wad_get_network_request`, `wad_list_console_messages`, `wad_wait_for`, `wad_batch`, `wad_api`, `wad_tools`
- **Reverse engineering: scripts, breakpoints, stepping, paused state, initiator, WebSocket, hooks** (16): `wad_list_scripts`, `wad_get_script_source`, `wad_save_script_source`, `wad_search_scripts`, `wad_find_api_usage`, `wad_set_breakpoint_on_text`, `wad_break_on_xhr`, `wad_list_breakpoints`, `wad_remove_breakpoint`, `wad_pause_or_resume`, `wad_step`, `wad_get_paused_info`, `wad_get_request_initiator`, `wad_get_websocket_messages`, `wad_ws`, `wad_hooks`
- **Debugger: one tool with every debugger action** (1): `wad_debug`
- **Render layer: DOM inspection and input injection** (2): `wad_dom`, `wad_interact`
- **Network: control plane and arbitrary requests** (2): `wad_network`, `wad_http`
- **Cloud development (decoded)** (1): `wad_cloud`
- **Native JSAPI layer** (2): `wad_native`, `wad_capture`
- **Plugin lifecycle and the in-app panel** (1): `wad_plugin`
- **Files, mini-program storage, event stream** (3): `wad_files`, `wad_storage`, `wad_events`
- **Account maintenance** (1): `wad_account`
- **Mini-program lifecycle and host actions** (1): `wad_app`
- **Raw CDP escape hatch** (1): `wad_cdp`

## Core: status, apps, accounts, settings, elements, network reads, waiting

| Tool | What it does | Arguments |
|---|---|---|
| `wad_status` | One-screen overview: device, app, accounts, targets, capture, plugins, config. Call it first. | — |
| `wad_capabilities` | Server/device capabilities, tool groups, /v1 routes, CDP domains, limits; `search` finds tools by keyword. | search:string, group:string |
| `wad_help` | Recipe text by topic: reverse, debug, network, plugin, snapshot, errors. | topic:string |
| `wad_list_apps` | Running mini-programs with logic/render target state. | — |
| `wad_open_app` | Open a mini-program by appid/username/name; `path` picks a page, `waitMs` waits for startup. | appid:string, username:string, name:string, path:string, waitMs:integer |
| `wad_close_app` | Close the mini-program with that appid. | appid:string |
| `wad_list_recent` | Recently used mini-programs; cursor/limit paging. | limit:integer, cursor:string |
| `wad_list_accounts` | Logged-in accounts, the current one, and online state. | — |
| `wad_switch_account` | Switch the active account; kills the runtime and reports needReopen. | id:string |
| `wad_login_start` | Start a QR login; returns session, qr_b64 and expiry. | — |
| `wad_login_poll` | Poll a QR login; on authorization it finishes and returns the account. | session:string, waitMs:integer |
| `wad_get_settings` | Settings schema plus current values; `group` filters. | group:string |
| `wad_set_settings` | Change settings by key/value or with a patch; reports applied and restartRequired. | key:string, value:any, patch:object |
| `wad_list_plugins` | Installed plugins with enabled state, version and update availability. | q:string, enabled:string, cursor:string |
| `wad_install_plugin` | Install a plugin from html/url/path with optional sha256; syntax is pre-checked. | html:string, url:string, path:string, sha256:string, enable:boolean |
| `wad_take_snapshot` | Compact element tree for the render or panel layer; returns `rev` and node `uid`s. | layer:string, appid:string, plugin:string, verbose:boolean, maxNodes:integer |
| `wad_click` | Click by uid, selector or visible text; pass `rev` so stale elements fail loudly. | layer:string, uid:string, selector:string, text:string, rev:string, dblClick:boolean, includeSnapshot:boolean |
| `wad_fill` | Fill an input by uid, selector or text; dispatches input/change events. | layer:string, uid:string, selector:string, text:string, value:string, rev:string |
| `wad_evaluate_script` | Run JS in the logic, render or panel layer; `byValue` controls what comes back. | layer:string, appid:string, expression:string, function:string, args:array, byValue:boolean |
| `wad_take_screenshot` | Screenshot the render layer or an element (JPEG q55 by default). | layer:string, appid:string, plugin:string, format:string, quality:integer, fullPage:boolean, uid:string, save:boolean |
| `wad_list_network_requests` | Network record summaries with filter/method/status/mime and paging. | cursor:string, limit:integer, filter:string, method:string, status:integer, mime:string, hasBody:boolean |
| `wad_get_network_request` | Full headers and body for one request; body=auto\|text\|base64\|none. | id:string, body:string, maxBytes:integer |
| `wad_list_console_messages` | Console messages from logic/render/panel with level and paging filters. | layer:string, levels:array, cursor:string, limit:integer, includeStack:boolean |
| `wad_wait_for` | Long-poll until text/selector/route/network/expression/app readiness; 10s default. | text:string, selector:string, route:string, network:string, expr:string, layer:string, timeoutMs:integer |
| `wad_batch` | Run 1-20 tool calls in order; stopOnError controls whether it aborts. | ops:array, stopOnError:boolean |
| `wad_api` | Call any internal /v1 endpoint (method/path/query/body) when no wrapper exists. | method:string, path:string, query:object, body:any |
| `wad_tools` | Ask the phone what it supports: list, describe, call, groups. The forward-compatibility channel. | action:string, name:string, group:string, search:string, args:object |


## Reverse engineering: scripts, breakpoints, stepping, paused state, initiator, WebSocket, hooks

| Tool | What it does | Arguments |
|---|---|---|
| `wad_list_scripts` | Loaded scripts with scriptId/url/endLine; `filter` and `groupBy` narrow it. | filter:string, groupBy:string |
| `wad_get_script_source` | Full source or a window; `line`/`column`/`contextLines`/`maxLineLength` for minified bundles. | scriptId:string, line:integer, column:integer, contextLines:integer, maxLineLength:integer |
| `wad_save_script_source` | Save a script to the host; returns a /v1/files/download URL and sha256. | scriptId:string |
| `wad_search_scripts` | Text or regex search across all scripts with real line/column and context. | query:string, regex:boolean, scriptFilter:string, caseSensitive:boolean, contextLines:integer, maxResults:integer, cursor:string |
| `wad_find_api_usage` | API radar: scans wx.* usage and keywords like sign/encrypt/token, grouped by script. | apis:array, keywords:array, maxResults:integer, groupBy:string |
| `wad_set_breakpoint_on_text` | Find code by text and set a breakpoint; optional `action` runs in the frame without pausing. | text:string, scriptFilter:string, occurrence:integer, condition:string, action:string, maxHits:integer, allOrNothing:boolean |
| `wad_break_on_xhr` | Break on XHR/fetch matching a URL pattern; optional method. | urlPattern:string, method:string |
| `wad_list_breakpoints` | Breakpoints with bound/pending/error state, hit count and last error. | — |
| `wad_remove_breakpoint` | Delete a breakpoint by id, or all with `all: true`. | id:string, all:boolean |
| `wad_pause_or_resume` | Pause or resume the logic layer; returns the current state. | action:string |
| `wad_step` | Step over/into/out or resume; returns the new position. | kind:string |
| `wad_get_paused_info` | Pause reason, every call frame, scopes/locals per frame, source context and async stack. | includeScopes:boolean, includeSourceContext:boolean, scopeDepth:integer, maxFrames:integer |
| `wad_get_request_initiator` | JS stack that issued a request, so an endpoint maps to a code location. | id:string, url:string, maxFrames:integer |
| `wad_get_websocket_messages` | Read WebSocket sessions and frames; equivalent to wad_ws action=frames. | id:string, cursor:string, limit:integer, direction:string, filter:string |
| `wad_ws` | WebSocket lifecycle: list/get/frames/send/recv/close/block/rewrite/clear/status. | action:string, id:string, url:string, data:string, opcode:string, direction:string, find:string, replace:string, regex:boolean, reason:string, code:integer, limit:integer, openOnly:boolean, filter:string, withFrames:boolean |
| `wad_hooks` | Persistent hooks: list/set/remove/clear/test. net.request, net.response and logic apply immediately. | action:string, id:string, phase:string, code:string, match:string, enabled:boolean |

- `wad_ws` action list: WebSocket lifecycle: list/get/frames/send/recv/close/block/rewrite/clear/status.
- `wad_hooks` action list: Persistent hooks: list/set/remove/clear/test. net.request, net.response and logic apply immediately.

## Debugger: one tool with every debugger action

| Tool | What it does | Arguments |
|---|---|---|
| `wad_debug` | Full debugger: enable, status, breakpoints, wait_for_pause, stack trace, scopes, evaluate on frame, set variable, contexts and more. | action:string, code:string, expression:string, frameId:string, objectId:string, name:string, value:string, condition:string, scriptId:string, line:integer, column:integer, contextId:integer, byValue:boolean, state:string, url:string, method:string, match:string, query:string, filter:string, occurrence:integer, maxHits:integer, text:string |

- `wad_debug` action list: Full debugger: enable, status, breakpoints, wait_for_pause, stack trace, scopes, evaluate on frame, set variable, contexts and more.

## Render layer: DOM inspection and input injection

| Tool | What it does | Arguments |
|---|---|---|
| `wad_dom` | DOM inspection: html/tree/query/node/attrs/styles/box/mutation for render or panel. | **action**:string, args:object |
| `wad_interact` | Input injection: hover/drag/press_key/type_text/select_option/scroll/click_at. | **action**:string, args:object |

- `wad_dom` action list: DOM inspection: html/tree/query/node/attrs/styles/box/mutation for render or panel.
- `wad_interact` action list: Input injection: hover/drag/press_key/type_text/select_option/scroll/click_at.

## Network: control plane and arbitrary requests

| Tool | What it does | Arguments |
|---|---|---|
| `wad_network` | Network control plane: list/get/wait/replay/sitemap/rules/scripts/export. | **action**:string, args:object |
| `wad_http` | Issue an arbitrary request through the mini-program's own wx.request stack; returns status/headers/body. | url:string, method:string, headers:object, body:string, bodyB64:string, timeoutMs:integer, responseType:string, dataType:string |

- `wad_network` action list: Network control plane: list/get/wait/replay/sitemap/rules/scripts/export.

## Cloud development (decoded)

| Tool | What it does | Arguments |
|---|---|---|
| `wad_cloud` | Cloud development calls across five sources (V3 Gateway, Call Gateway, V3 Container, Call Container, cloud functions): list/get/tags/records/rules/scripts/export/creds/keys/decode/build/clear/set_capture/status. | **action**:string, args:object |

- `wad_cloud` action list: Cloud development calls across five sources (V3 Gateway, Call Gateway, V3 Container, Call Container, cloud functions): list/get/tags/records/rules/scripts/export/creds/keys/decode/build/clear/set_capture/status.

## Native JSAPI layer

| Tool | What it does | Arguments |
|---|---|---|
| `wad_native` | Native JSAPI layer: list/get/credentials/capture_set/hook_set/decode/extract. | **action**:string, args:object |
| `wad_capture` | Capture switches and buffers: status/set for network, native, console and render. | **action**:string, args:object |

- `wad_native` action list: Native JSAPI layer: list/get/credentials/capture_set/hook_set/decode/extract.
- `wad_capture` action list: Capture switches and buffers: status/set for network, native, console and render.

## Plugin lifecycle and the in-app panel

| Tool | What it does | Arguments |
|---|---|---|
| `wad_plugin` | Plugin lifecycle and panel: get/set_enabled/global/set_appids/uninstall/reload/market_search/market_info/logs/state/panel_open/panel_close/panel_list/evaluate/files_*. | **action**:string, args:object |

- `wad_plugin` action list: Plugin lifecycle and panel: get/set_enabled/global/set_appids/uninstall/reload/market_search/market_info/logs/state/panel_open/panel_close/panel_list/evaluate/files_*.

## Files, mini-program storage, event stream

| Tool | What it does | Arguments |
|---|---|---|
| `wad_files` | tree/read/search/download/link/zip for scopes scripts/plugin/net/native/logs/shots/snapshots. | **action**:string, args:object |
| `wad_storage` | Mini-program storage: list/get/set/remove/clear/dump. | **action**:string, args:object |
| `wad_events` | Unified event stream: list/wait/record/stop with cursors. | **action**:string, args:object |

- `wad_files` action list: tree/read/search/download/link/zip for scopes scripts/plugin/net/native/logs/shots/snapshots.

## Account maintenance

| Tool | What it does | Arguments |
|---|---|---|
| `wad_account` | Account maintenance: remove/health/logout/login_cancel. | **action**:string, args:object |


## Mini-program lifecycle and host actions

| Tool | What it does | Arguments |
|---|---|---|
| `wad_app` | Mini-program lifecycle: restart (hard:true rebuilds the runtime), search, info, action (closeVerifyPopup/closePopups/checkUpdate). | **action**:string, args:object |


## Raw CDP escape hatch

| Tool | What it does | Arguments |
|---|---|---|
| `wad_cdp` | Raw CDP: send/list/domains. Logic layer is full CDP; render uses short connections; panel supports Runtime.evaluate only. | **action**:string, args:object |


## Aggregator-only tools

| Tool | What it does | Arguments |
|---|---|---|
| `wad_devices` | Lists phones: alias, uuid, model, transports, `mcpVersion`, `mcpApiLevel`, `devicePort`, `online`, `metaTool` | — |
| `wad_device_use` | Pins the default device for this session | **device**:string |

## `wad_tools` (forward-compatibility channel)

`wad_tools` asks the **phone** what it supports, so it works even when this server is older
than the app:

| action | Result |
|---|---|
| `list` | tool names with group and `since` (narrow with `group` / `search`) |
| `describe` | full JSON schema for one `name` |
| `call` | invoke `name` with `args` — the escape hatch for newer phone tools |
| `groups` | counts per group plus the phone's `apiLevel` |



## apiLevel 100 additions (5 new tools)

| Tool | Purpose |
|---|---|
| `wad_injected {list/clear}` | Registry of debugger monkey-patch injections |
| `wad_ilink` | Pure-protocol plane off the current account (no WMPF): actions `get-cloud-gateway-v3-token-key` / `get-cloud-container-token-key` / `js-operate-wx-data` / `js-operate-wx-data-by-api` / `js-login` / `get-user-encrypt-key` / `verify-plugin` / `update-wxa-usage-record` / `app_info`. Unified envelope `{ok, code, category, retryable, message, data}` — see [pure-protocol.md](pure-protocol.md) for worked examples and the risk-control playbook (-12030/-12028/61010) |
| `wad_rewrite {list/set/delete/enable/disable/clear/test}` | Network rewrite rules CRUD |
| `wad_rewrite_scripts {…}` | Network rewrite scripts CRUD (return-contract, see SKILL §9) |
| `wad_cloud_scripts {…}` | Cloud-dev rewrite scripts CRUD (onRequest/onResponse on res.resp) |
