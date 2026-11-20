# Cloud development capture and calls

Mini-programs that use cloud development do not send plain REST calls for data. They call
`wx.cloud.callFunction`, open containers, or use the cloud gateway, all wrapped in a proprietary
envelope. WeAppDev decodes those envelopes and exposes the plaintext.

## Two different questions

| The user asks | Use |
|---|---|
| "What cloud calls is this app making? Show me the data." | `wad_cloud` (records, already decoded) |
| "Call this cloud function with my own parameters." | `wad_cloud` actions `build` / `decode`, or `wad_http` for the raw path |

There are **five sources** the tool distinguishes, because they have different envelopes:

1. V3 Gateway
2. Call Gateway
3. V3 Container
4. Call Container
5. plain cloud functions

`wad_cloud { "action": "tags" }` lists which ones were actually observed.

## Record schema

Cloud records are decoded to plaintext and aligned with the network record shape, so
`method` / `url` / `header` / `body` / `statusCode` mean the same thing you would see in
[network-capture.md](network-capture.md). This is deliberate: the same reading habits work in both.

## Read the records

```
wad_cloud { "action": "status" }                    # capture on/off, counts per source
wad_cloud { "action": "set_capture", "enabled": true }
wad_cloud { "action": "list", "limit": 20 }
wad_cloud { "action": "list", "tag": "V3 Gateway" }
wad_cloud { "action": "get", "id": "<id>" }
wad_cloud { "action": "records", "tail": 50 }
wad_cloud { "action": "tags" }
```

Enable capture **before** the traffic. A cloud call made while capture was off appears nowhere.

## Keys and credentials

Cloud gateway payloads are encrypted with a per-domain key negotiated at runtime. The app recovers it
and can show it:

```
wad_cloud { "action": "keys" }        # domain -> key/expiry
wad_cloud { "action": "creds" }       # credentials seen in envelopes
```

Why this matters: to replay a cloud call yourself you need that key, and it rotates. Read it right
before you build the request, not from an earlier session.

## Decode and build

```
# decode an envelope you captured (or one the user pasted)
wad_cloud { "action": "decode", "data": "<ciphertext>" }

# build a request for a cloud function with your own parameters
wad_cloud { "action": "build", "name": "getUserInfo", "data": { "uid": "123" } }
```

`build` gives you the full request (URL, headers, encrypted body) ready to send with `wad_http`, which
is the reliable way to exercise a cloud function with unusual inputs.

## Rules and scripts

```
wad_cloud { "action": "rules" }
wad_cloud { "action": "scripts" }
wad_cloud { "action": "export", "format": "json" }
wad_cloud { "action": "clear" }
```

`rules` shows any rewriting configured for cloud traffic; `scripts` shows the cloud script hooks that
are active. Both are empty on a fresh install.

## Recipe: recover what a cloud function returns

```
1  wad_open_app  { appid }
2  wad_status                                  logic === true
3  wad_cloud     { action: "set_capture", enabled: true }
4  (drive the page so it calls the cloud function)
5  wad_cloud     { action: "list", limit: 10 }
6  wad_cloud     { action: "get", id: "<id>" } # decoded plaintext
7  wad_cloud     { action: "keys" }            # if you want to replay it
8  wad_cloud     { action: "build", name: "<fn>", data: {...} }
9  wad_http      { url, method, headers, body }# from step 8
```

If step 5 is empty but the page clearly works, the call may be going through a path this build does
not label as cloud traffic — check `wad_native { action: "list" }`, the envelope usually shows up there
with the gateway path in the body.

## Common confusion

| Symptom | Explanation |
|---|---|
| Records exist but `body` is empty | response body was empty or below the size threshold; check `headers` and status |
| `keys` shows an expired domain | the key rotated; re-trigger traffic and read again |
| `decode` fails on your own ciphertext | wrong source tag — pass the same `tag` you saw in `list` |
| Cloud capture on, `wad_list_network_requests` empty | expected: cloud traffic is recorded by `wad_cloud`, not the HTTP ring |
| The same call appears in both rings | possible for gateway paths; the cloud copy is the decoded one, prefer it |

## Related

- [network-capture.md](network-capture.md) — plain HTTP records and replay
- [native-capture.md](native-capture.md) — the JSAPI envelope layer underneath
- [reverse-engineering.md](reverse-engineering.md) — when you need the algorithm, not just the result


## Cloud rewrite scripts — contract (measured)

`POST /v1/cloud/scripts {"id","name","enable","content"}`; hooks are named
`onRequest` / `onResponse` and the response object is the **callback view** — the
payload lives in `res.resp` (not `res.result`), again return-contract:

```js
function onResponse(res){ try{ if(res&&res.resp&&typeof res.resp==='object'){ res.resp._wad=1; return res; } }catch(e){} }
```

Native-path response rewrite additionally requires `POST /v1/capture/cloud {"on":true}`
(container-side activation is pending fix K-5k). For instant rewriting without that,
wrap `wx.cloud.callFunction` in a plugin (see plugins.md).
