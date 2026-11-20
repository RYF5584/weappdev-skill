# Network capture, replay and rewriting

WeAppDev records every HTTP(S) request the mini-program makes, plus (separately) the native JSAPI
envelope layer. This page covers the HTTP side; see [native-capture.md](native-capture.md) for the
envelope layer and [cloud-capture.md](cloud-capture.md) for cloud-development traffic.

## Turn capture on

```
wad_capture { "action": "status" }                                  # what is on right now
wad_capture { "action": "set", "kind": "network", "enabled": true }
```

Capture must be on **before** the traffic happens. Enabling it later only records future requests.

## Read the records

```
wad_list_network_requests { "limit": 20 }
wad_list_network_requests { "method": "POST", "status": 200, "mime": "json" }
wad_list_network_requests { "filter": "/api/", "hasBody": true }
```

Each record has `id`, `method`, `url`, `status`, `mime`, sizes, timing and an `initiator` summary.
Records are newest-last; use `cursor` for paging when there are many.

Get one record in full:

```
wad_get_network_request { "id": "<id>", "body": "auto" }
```

| `body` | Result |
|---|---|
| `auto` | text when the payload is textual, base64 otherwise |
| `text` | force text (may mangle binary) |
| `base64` | always base64 — use for protobuf, images, encrypted bodies |
| `none` | headers only; use for large responses you do not need |

`maxBytes` truncates. A truncated body is flagged in the result; do not treat a truncated JSON body as
invalid.

## Correlate a request with the code

```
wad_get_request_initiator { "id": "<id>" }
```

Returns the JS stack that issued the request (script URL, line, column). This is the fastest bridge
from "an API call" to "the function that built it" — see
[reverse-engineering.md](reverse-engineering.md).

## Replay

`wad_http` executes `wx.request` **inside the mini-program's logic layer**, so the replay inherits the
mini-program's network stack, cookies, UA, domain whitelist and any in-app request interceptor.

```
wad_http {
  "url": "https://api.example.com/v1/items",
  "method": "POST",
  "headers": { "content-type": "application/json", "authorization": "<from capture>" },
  "body": "{\"page\":1}",
  "timeoutMs": 15000
}
```

Returns `{ status, headers, body }`. Notes:

- `responseType: "arraybuffer"` when the response is binary; the body then comes back base64.
- `bodyB64` instead of `body` when you need to send binary.
- `timeoutMs` is clamped to 1–20s.
- A non-2xx status is still a successful tool call — inspect `status`.

This is also the way to verify a recovered algorithm: replay with a freshly computed signature and
check the server response, rather than trusting the arithmetic.

## Wait for traffic instead of polling

```
wad_network { "action": "wait", "args": { "url": "/api/checkout", "timeoutMs": 10000 } }
```

Returns as soon as a matching request appears, or reports a timeout. Cheaper and more reliable than a
sleep loop.

## Rewriting and rules

```
wad_network { "action": "rules" }                 # list active rules
wad_network { "action": "replay", "args": { "id": "<id>" } }
wad_network { "action": "sitemap" }               # distinct hosts/paths seen
wad_network { "action": "export", "args": { "format": "json" } }
```

`wad_network` and `wad_capture` are the control plane; the individual `wad_list_network_requests` /
`wad_get_network_request` tools are the read plane. When in doubt, `wad_network { action: "list" }`
accepts the same filters as the read tools.

## Persistent hooks (live modification)

When you need to change requests/responses for the rest of the session, use hooks rather than
one-off rules:

```
wad_hooks { "action": "list" }
wad_hooks { "action": "set", "id": "myhook", "phase": "net.request",
            "match": "/api/user",  "code": "return body.replace('\"vip\":0','\"vip\":1')" }
wad_hooks { "action": "test", "id": "myhook" }
wad_hooks { "action": "remove", "id": "myhook" }
```

`net.request` and `net.response` take effect immediately; `native.*` phases require the plugin API
(see [plugins.md](plugins.md)). Always remove hooks you add — they survive until the process restarts.

## Console output

```
wad_list_console_messages { "layer": "logic", "limit": 50 }
wad_list_console_messages { "levels": ["error", "warn"] }
```

Useful to confirm that a rewrite actually reached the page's code path (a rewritten response often
triggers a different log line).

## Practical notes

- Capture keeps a bounded ring buffer; if the app has been running a long time, older entries are
  gone. Export early if you need history.
- Request bodies of large uploads are truncated by design; `maxBytes` never reconstructs them.
- The URLs you see are the ones the mini-program requested, not the ones a proxy rewrote.
- If `wad_capture` reports `enabled: true` but the list stays empty, the mini-program may be using a
  transport this build does not intercept (e.g. a native plugin channel) — check
  [native-capture.md](native-capture.md).


<a id="scripts"></a>
## Rewrite scripts — the return contract (measured)

`POST /v1/rewrite/scripts {"id","name","enable","content"}`. The `content` defines
`onRequest(req)` / `onResponse(res)` and **must return the object** for the change to be
applied — mutating the argument without returning it is silently dropped:

```js
function onRequest(req){ if(req.url.indexOf('x=1')<0){ req.url+=(req.url.indexOf('?')>=0?'&':'?')+'x=1'; return req; } }
function onResponse(res){ if(res.data&&res.data.toast!==undefined){ delete res.data.toast; return res; } }
```

Verify it really fires: the rewritten request shows up in `/v1/hook/store` with the
changed URL/headers, and the business callback receives the changed `data`. Enable
network capture first (`POST /v1/capture/network {"on":true}`).
