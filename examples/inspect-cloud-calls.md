# Example: inspect cloud-development calls

Goal: see the actual data a mini-program exchanges with cloud functions, then reproduce one call.

## 1. Open the app and enable cloud capture

```
wad_open_app { "appid": "wx1234567890abcdef" }
wad_status
wad_cloud   { "action": "status" }
wad_cloud   { "action": "set_capture", "enabled": true }
```

Cloud capture is separate from the HTTP capture switch — enabling only
`wad_capture { kind: "network" }` will leave this list empty.

## 2. Trigger the call

Drive the page so it calls the cloud function (`wad_take_snapshot`, `wad_click`), or replay a captured
call later.

## 3. Read what happened

```
wad_cloud { "action": "list", "limit": 10 }
wad_cloud { "action": "tags" }
```

`tags` tells you which of the five sources was used: V3 Gateway, Call Gateway, V3 Container,
Call Container, or a plain cloud function. The source matters because each has a different envelope.

Records are already decoded to plaintext and share the network record shape:

```
wad_cloud { "action": "get", "id": "<id>" }
```

Read `url`, `method`, `statusCode`, `header` and `body` exactly as you would for HTTP.

## 4. Reproduce one call with your own parameters

```
wad_cloud { "action": "keys" }
wad_cloud { "action": "build", "name": "<cloud function name>", "data": { "any": "input" } }
```

`build` returns a ready request (URL, headers, encrypted body). Send it with `wad_http`:

```
wad_http {
  "url": "<from build>",
  "method": "POST",
  "headers": { "<from build>": "..." },
  "body": "<from build>",
  "timeoutMs": 15000
}
```

Read the keys immediately before building: the per-domain key rotates, and a stale key produces a
decrypt failure that looks like a wrong request.

## 5. If the list stays empty

| Check | Command |
|---|---|
| capture actually on | `wad_cloud { "action": "status" }` |
| app still on the expected page | `wad_list_apps` |
| the call is really plain HTTP | `wad_list_network_requests` |
| the call went through the native layer instead | `wad_capture { action:"set", kind:"native", enabled:true }` then `wad_native { action:"list" }` |

## 6. Clean up

```
wad_cloud { "action": "set_capture", "enabled": false }
```

## What to report

- Which source tag the call used.
- The decoded request and response bodies.
- Whether `build` + `wad_http` reproduced it, and with which inputs.
