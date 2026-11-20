# WebSocket: capture, send, block, rewrite

The mini-program WebSocket stack is wrapped by a probe shell, so WeAppDev can see frames in both
directions, inject frames, and rewrite or block them.

## Turn it on

WebSocket capture follows the network capture switch:

```
wad_capture { "action": "set", "kind": "network", "enabled": true }
```

Then open a socket from the mini-program (navigate, or run `wx.connectSocket` yourself):

```
wad_evaluate_script {
  "layer": "logic",
  "expression": "wx.connectSocket({url:'wss://example.com/ws'}) && 'ok'"
}
```

## List and inspect

```
wad_ws { "action": "list" }                            # sessions: id, url, open/closed, frame counts
wad_ws { "action": "get", "id": "ws1-123", "withFrames": true }
wad_ws { "action": "frames", "id": "ws1-123", "limit": 50, "direction": "recv" }
wad_ws { "action": "frames", "filter": "hello" }        # substring match on payload
wad_ws { "action": "status" }
```

`get_websocket_messages` is the older read-only equivalent of `frames`; prefer `wad_ws`.

## Send a frame

```
wad_ws { "action": "send", "id": "ws1-123", "data": "{\"cmd\":\"ping\"}" }
wad_ws { "action": "send", "id": "ws1-123", "data": "<base64>", "opcode": 2 }
```

`send` is performed **by the page's own socket** (the shell forwards it), so server-side session
state stays consistent. This is why sending from here works where a fresh external socket would be
rejected.

## Inject a receive frame

```
wad_ws { "action": "recv", "id": "ws1-123", "data": "{\"result\":\"ok\"}" }
```

`recv` does not go to the server: it delivers the payload to the page's `onMessage` handler. Use it to
reproduce "what happens when the server says X" without a cooperating server.

## Block and rewrite

```
wad_ws { "action": "block",   "id": "ws1-123", "direction": "send" }
wad_ws { "action": "rewrite", "id": "ws1-123", "direction": "send",
         "find": "gold", "replace": "gem", "regex": false }
wad_ws { "action": "rewrite", "id": "ws1-123", "direction": "recv",
         "find": "^\\{", "replace": "{\"injected\":1,", "regex": true }
```

- `direction` is `send`, `recv`, or `both`.
- `block` on `send` prevents the frame from leaving the device (the server never sees it); on `recv`
  the page never receives it.
- `rewrite` does a literal replace by default; `regex: true` switches to a pattern.
- Rules are per session id and per direction, up to 32 rules per direction.

## Close and clear

```
wad_ws { "action": "close", "id": "ws1-123", "code": 1000, "reason": "debug" }
wad_ws { "action": "clear" }
```

`close` marks the session closed immediately even if the shell's close callback is delayed; `clear`
empties the observable frame store.

## Frames you should expect

| Frame kind | Meaning |
|---|---|
| `wsopen` | handshake done, `status: 101` |
| `wssend` | a frame left the page, with direction `send` |
| `wsrecv` | a frame arrived at the page |
| `wsblocked` | a rule ate the frame (both directions) |
| `wsclose` | socket closed, with a reason |

## Recipe: replay a protocol conversation

```
1  wad_capture { action:"set", kind:"network", enabled:true }
2  (drive the page until the socket is open)
3  wad_ws { action:"list" }                     # find the session id
4  wad_ws { action:"frames", id, limit:100 }    # read the handshake conversation
5  wad_ws { action:"send", id, data:"<the next frame you want to send>" }
6  wad_ws { action:"frames", id, direction:"recv", limit:20 }   # server reply
```

If step 5 returns `E_NO_WS` or `E_NO_WS_TASK`, the socket closed — re-open it from the page; the shell
only attaches to sockets opened after the capture is on.

## Limits and gotchas

| Situation | Behaviour |
|---|---|
| Socket opened before capture | not observable; open it again |
| Binary frames | payload is base64; pass `opcode: 2` to send binary |
| Very chatty socket | frame store is bounded per session; `limit` pages backwards |
| Frame rewriting and `wad_network` rules both set | the shell-level WebSocket rule wins for frames |
| `E_NO_WS_CTX` | no logic-layer context available — the mini-program is not running |

## Related

- [network-capture.md](network-capture.md) — HTTP records
- [plugins.md](plugins.md) — plugin-side `wad.ws.*` API for durable rules
