# Reverse engineering a mini-program

Goal: go from "the app sends a signed request" to "here is the algorithm, and here is a replay that
works", using only MCP calls.

## The recipe (in order)

```
1  wad_open_app   { appid }                  open the target
2  wad_status                                wait for logic === true
3  wad_capture    { action:"set", kind:"network", enabled:true }
4  wad_native     { action:"list", tail:50 } find an interesting request
5  wad_get_request_initiator { id }          which JS built it
6  wad_search_scripts { query:"sign" }       find the signing code
7  wad_get_script_source { scriptId, line, column }   read it in context
8  wad_set_breakpoint_on_text { text }       stop where it is computed
9  wad_get_paused_info                       dump the live values
10 wad_http        { url, method, headers, body }   replay with your own values
```

Steps 1–2 are mandatory. Steps 3–5 give ground truth; never guess an endpoint.

## Step 1–2: open and confirm

```
wad_open_app { "appid": "wx1234567890abcdef" }
wad_status
```

Read `apps[]`: you need `logic: true`. `render: true` is only needed for UI work.

If another mini-program is already open, the container may keep it. Then:

```
wad_app { "action": "restart", "appid": "wx1234567890abcdef", "hard": true }
```

`hard: true` kills the runtime process and rebuilds the inspector. Expect ~10–20s before `logic`
goes true, and expect the previous app's state to be gone.

## Step 3–4: find the request

Turn capture on first — a capture started after the request will not contain it.

```
wad_capture { "action": "set", "kind": "network", "enabled": true }
wad_capture { "action": "set", "kind": "native",  "enabled": true }
```

`network` = HTTP(S) through the mini-program stack. `native` = the JSAPI envelope layer (useful when
the real payload never appears as plain HTTP).

```
wad_list_network_requests { "limit": 20, "method": "POST" }
wad_get_network_request   { "id": "<id>", "body": "auto" }
```

`body: "auto"` returns text when it is text and base64 otherwise; `"text"` / `"base64"` / `"none"`
force one form. Use `"none"` when you only need headers.

## Step 5: locate the code that produced it

```
wad_get_request_initiator { "id": "<networkId>" }
```

Returns the JS call stack captured at send time: script URL, line, column. That is the exact place
the request was assembled — usually one frame below the signing function.

If the initiator is empty (some requests are issued from native code), fall back to searching.

## Step 6: read the scripts

```
wad_list_scripts      { "filter": "usr" }          user code vs vendor code
wad_search_scripts    { "query": "x-wxmem-sign",   "scriptFilter": "usr", "contextLines": 3 }
wad_search_scripts    { "query": "secure_v6_encrypt" }
wad_find_api_usage    { "keywords": ["sign","encrypt","token"] }
```

`wad_search_scripts` returns the **real** `line` and `column` inside minified bundles. Never compute
positions yourself from a pretty-printed copy.

Read a window around the hit:

```
wad_get_script_source {
  "scriptId": "<id>", "line": 907, "column": 607, "contextLines": 0, "maxLineLength": 4000
}
```

Minified code is one enormous line, so `contextLines: 0` plus a large `maxLineLength` and a real
`column` is what actually works. Shrink `maxLineLength` only when the tool complains about size; for
very large files use `wad_save_script_source` and read it locally.

## Step 7–9: stop at the computation

Two breakpoint styles:

```
# by code text (best for minified code, no line numbers needed)
wad_set_breakpoint_on_text { "text": "secure_v6_encrypt", "occurrence": 1 }

# by URL pattern (see the request before it is sent)
wad_break_on_xhr { "urlPattern": "/api/customer" }
```

Then trigger the code path (navigate, tap, or `wad_http` a request the page makes) and inspect:

```
wad_list_breakpoints { }        # bound / pending / error per breakpoint
wad_get_paused_info  { }        # reason, callFrames, scopes, locals, source context
wad_debug { "action": "get_contexts" }             # valid contextIds
wad_debug { "action": "evaluate_on_frame", "expression": "JSON.stringify(this)" }
wad_debug { "action": "get_scope", "frameId": "<id>", "scopeIndex": 0 }
wad_step  { "kind": "over" }
wad_pause_or_resume { "action": "resume" }
```

`wad_get_paused_info` is the workhorse: it returns the paused reason, every frame, the local
variables per scope and a source window, in one call.

To run a statement in a paused frame without stopping again:

```
wad_set_breakpoint_on_text {
  "text": "function checkHit2Core",
  "action": "this.hit=1",
  "maxHits": 1
}
```

`action` executes inside the paused frame and then auto-resumes — that is how "make the game always
win" style plugins are built. **Tell the user before doing this**, and remove it afterwards with
`wad_remove_breakpoint { "all": true }`.

## Step 10: prove it by replaying

```
wad_http {
  "url": "https://example.com/api/endpoint",
  "method": "POST",
  "headers": { "content-type": "application/json" },
  "body": "{\"a\":1}",
  "timeoutMs": 15000
}
```

`wad_http` runs `wx.request` **inside the logic layer**, so domain whitelists, TLS settings, cookies,
UA and any in-app signing interceptor behave exactly as they do for the mini-program. That is why a
replay from here succeeds where a curl from the PC fails.

Replay a captured request verbatim first (same headers and body). Only then change one field at a
time. If the original succeeds and yours fails, the difference is your algorithm, not the transport.

## Reading a captured signature algorithm

Typical shape of a mini-program signer, and where to look:

| What you see | Where it lives |
|---|---|
| `x-wxmem-sign`, `X-WX-*` headers | built just before the request; search the header name |
| `staticKey`, `sm3`, `sm4`, `hmac` | a crypto helper module imported by the request wrapper |
| timestamp + nonce + body hash | usually concatenated in a fixed order; read the literal order in code |
| encrypted body with base64 | find `encrypt(`, then the key source (often a second endpoint) |

Verify by replaying with a fresh timestamp: if the server accepts your replay, the construction is
fully understood.

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `E_LOGIC_DOWN` | mini-program not running, or inspector not attached | `wad_status`, then `wad_open_app` |
| `E_STALE_SCRIPT` | the bundle was replaced (app restart / page change) | `wad_list_scripts` again; ids change |
| Breakpoint stays `pending` | the code has not been loaded/evaluated yet | navigate to the page that loads it, or use `wad_break_on_xhr` |
| Nothing in `wad_native` | capture was enabled after the request | enable capture first, then trigger |
| `E_NO_TARGET` on render tools | no visible page | open the app, or `wad_app restart hard:true` |
| Search hits the wrong place | vendor copy of the same string | `"scriptFilter": "usr"` |
| Two mini-programs confuse results | one container, one inspector | keep only the target open |
