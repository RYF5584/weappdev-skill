# Native layer capture, decoding and hooks

"Native" here means the JSAPI boundary: every `wx.*` call the mini-program makes passes through a
native invoke handler, and some of them (`js-operatewxdata`, cloud gateway calls, credential
requests) never appear as ordinary HTTP in the render/logic layer. WeAppDev observes that boundary
and exposes it as its own record ring.

Use this page when [network-capture.md](network-capture.md) is empty but the app clearly talks to a
server, or when the payload you need is wrapped in an envelope.

## Turn capture on

```
wad_capture { "action": "status" }
wad_capture { "action": "set", "kind": "native", "enabled": true }
```

Note: the **callback** side (plugin `nativeReq` / `nativeResp` events) is independent of this switch —
plugins receive native events even while the UI ring is off. The switch only controls the browseable
record list.

## Read the records

```
wad_native { "action": "list", "tail": 50 }
wad_native { "action": "list", "api": "operateWXData" }
wad_native { "action": "get", "id": "<id>" }
```

Each record has `api`, `appid`, `seq`, `body` (the business JSON string), and for responses
`reqBody` so request and response can be paired. `kind` distinguishes `req` from `resp`.

## Credentials

```
wad_native { "action": "credentials" }
```

Shows credential-shaped values observed on the boundary (tokens, session ids, gateway keys) with the
domain/API they were attached to.

## Decode an envelope

```
wad_native { "action": "decode", "data": "<base64 or ciphertext>" }
wad_native { "action": "extract", "id": "<id>", "path": "data.gwKey" }
```

`decode` tries the known envelope formats (cloud gateway V3, snappy+JSON, protobuf). If it fails, the
payload probably needs a per-domain key — read it with `wad_cloud { action: "keys" }`.

## Rewrite live traffic

There are two ways, and they differ in lifetime:

**Hooks** (persist for the session, no plugin needed):

```
wad_hooks { "action": "list" }
wad_hooks {
  "action": "set", "id": "add-probe", "phase": "net.request",
  "match": "operateWXData",
  "code": "var o=JSON.parse(body); o.__probe=1; return JSON.stringify(o)"
}
wad_hooks { "action": "remove", "id": "add-probe" }
```

`net.request` / `net.response` / `logic` take effect immediately. `native.*` phases require the plugin
API (see [plugins.md](plugins.md)), because they run inside the relay that the plugin runtime owns.

**Plugins** (declarative, survive restarts, can be enabled per appid):

```html
<script type="text/wad-logic">
wad.on('nativeReq', function (d) {
  // d = { api, appid, seq, body, transformed? }
  var o = JSON.parse(d.body);
  o.__probe = 1;
  return o;            // returning an object/JSON replaces the outgoing body
});
wad.on('nativeResp', function (d) {
  var o = JSON.parse(d.body);
  o.__respProbe = 1;
  return o;            // returning undefined leaves it untouched
});
</script>
```

Full plugin lifecycle: [plugins.md](plugins.md).

Hook semantics worth knowing:

- A handler returning an object or JSON string **replaces** the body; returning anything else leaves
  it unchanged.
- Chained: with several plugins, each sees the previous one's output.
- Budgeted: a single plugin gets ~260ms and the whole request ~900ms, then the current result is used.
  Slow hooks degrade into "no change" rather than blocking the network — do not put heavy work there.

## Pairing request and response

`seq` is the join key. When reading a response record, `reqBody` is the request that produced it, so
you do not have to correlate by timestamp:

```
wad_native { "action": "list", "tail": 400 }
# pick the entry whose kind === "req" and whose body mentions the API you care about
# then the entry with the same seq and kind === "resp"
```

## Recipe: find what a UI action sends when no HTTP appears

```
1  wad_open_app  { appid }
2  wad_capture   { action:"set", kind:"native", enabled:true }
3  (tap the button; use wad_take_snapshot + wad_click if you need to drive it)
4  wad_native    { action:"list", tail: 50 }
5  wad_native    { action:"get", id:"<id>" }
6  wad_native    { action:"decode", id:"<id>" }     # if the body looks binary
7  wad_cloud     { action:"keys" }                  # if decoding needs a domain key
```

## Known limits

| Situation | Behaviour |
|---|---|
| Async JSAPI calls | only the request is observed; there is no synchronous return to capture (`nativeResp` is for synchronous APIs) |
| Binary payloads | stored base64, may be size-capped; use `get` and decode locally |
| Native page switch off | the browseable ring stops filling, but plugin callbacks keep firing |
| Very high request rates | the ring is bounded; export early if you need full history |

## Related

- [cloud-capture.md](cloud-capture.md) — the decoded cloud view built on top of these envelopes
- [network-capture.md](network-capture.md) — plain HTTP records
- [plugins.md](plugins.md) — the durable way to rewrite native traffic
