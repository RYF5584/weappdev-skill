# Example: reverse a signed request

Goal: find the code that signs an API request, extract the inputs, and prove that we can reproduce a
working request from outside the mini-program.

## 1. Open and confirm

```
wad_open_app  { "appid": "wx1234567890abcdef" }
wad_status
```

Require `apps[].logic === true`. If another mini-program is running:

```
wad_app { "action": "restart", "appid": "wx1234567890abcdef", "hard": true }
wad_status
```

## 2. Enable capture before triggering traffic

```
wad_capture { "action": "set", "kind": "network", "enabled": true }
wad_capture { "action": "set", "kind": "native",  "enabled": true }
```

## 3. Trigger the request and find it

Navigate or tap so the app issues the call (see
[../examples/drive-the-ui.md](drive-the-ui.md) if you need to click through).

```
wad_wait_for     { "network": "/api/", "timeoutMs": 15000 }
wad_list_network_requests { "limit": 20, "method": "POST" }
wad_get_network_request   { "id": "<id>", "body": "auto" }
```

Record the exact headers and body. Those are your ground truth for step 6.

## 4. Find the code that built it

```
wad_get_request_initiator { "id": "<id>" }
```

If it returns a stack, use that `line`/`column` directly. If it is empty, search:

```
wad_list_scripts   { "filter": "usr" }
wad_search_scripts { "query": "sign", "scriptFilter": "usr", "contextLines": 3 }
wad_search_scripts { "query": "<a header name you saw>", "scriptFilter": "usr" }
```

## 5. Read the implementation

```
wad_get_script_source {
  "scriptId": "<scriptId>",
  "line": <line>,
  "column": <column>,
  "contextLines": 0,
  "maxLineLength": 4000
}
```

Minified bundles are single lines: keep `contextLines` at 0 and rely on the real `column`. Walk to
neighbouring helpers with new searches rather than guessing offsets.

For a large file:

```
wad_save_script_source { "scriptId": "<scriptId>" }
# then open the returned /v1/files/download URL locally
```

## 6. Prove the algorithm by replaying

First replay the captured request verbatim:

```
wad_http {
  "url": "<url from the record>",
  "method": "POST",
  "headers": { "<copied headers>": "..." },
  "body": "<copied body>",
  "timeoutMs": 15000
}
```

If that returns 200, replace one field at a time with your own computation (new timestamp, new nonce,
new signature). A successful replay with your own inputs means the algorithm is recovered.

`wad_http` runs inside the logic layer, so it inherits the mini-program's network stack. A failure
here is therefore an algorithm problem, not a transport problem.

## 7. Verify with a fresh timestamp

Signatures with a time component must be regenerated, not reused. Replay twice with different
timestamps: both should succeed. If only the first works, the server is doing replay detection and
your understanding of the timestamp derivation is incomplete.

## 8. Clean up

```
wad_remove_breakpoint { "all": true }
wad_capture { "action": "set", "kind": "network", "enabled": false }
```

Leaving breakpoints or hooks behind will confuse the next session.

## What to report

- The algorithm (concatenation order, hash/encryption, key source).
- Where it lives (script URL + line), so a human can re-check.
- A replay that works, with which fields were replaced.
- Any dynamic key material and where it comes from (often a second endpoint).
