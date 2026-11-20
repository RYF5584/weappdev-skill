# Example: capture a WebSocket and replay a frame

Goal: watch a real-time protocol, then send your own frame and observe the reply.

## 1. Enable capture and open the socket

```
wad_open_app { "appid": "wx1234567890abcdef" }
wad_status
wad_capture { "action": "set", "kind": "network", "enabled": true }
```

Now drive the page so it connects (WebSocket capture follows the network switch). If you need to open
one yourself:

```
wad_evaluate_script {
  "layer": "logic",
  "expression": "wx.connectSocket({url:'wss://example.com/ws'}) && 'ok'"
}
```

## 2. Find the session

```
wad_ws { "action": "list" }
```

Pick the session id whose `url` matches. A session must be opened **after** capture was enabled to be
observable.

## 3. Read the conversation

```
wad_ws { "action": "frames", "id": "ws1-123", "limit": 50 }
wad_ws { "action": "frames", "id": "ws1-123", "direction": "recv", "filter": "auth" }
```

Frame kinds: `wsopen`, `wssend`, `wsrecv`, `wsblocked`, `wsclose`. Binary frames arrive base64-encoded.

## 4. Send a frame as the page

```
wad_ws { "action": "send", "id": "ws1-123", "data": "{\"cmd\":\"ping\"}" }
wad_ws { "action": "frames", "id": "ws1-123", "direction": "recv", "limit": 5 }
```

Sending happens through the page's own socket, so server-side session state stays valid.

## 5. Inject a receive frame

To test how the page reacts to a server message you cannot produce:

```
wad_ws { "action": "recv", "id": "ws1-123", "data": "{\"result\":\"ok\"}" }
```

This goes to the page's `onMessage`, not to the server.

## 6. Modify traffic

```
wad_ws { "action": "block",   "id": "ws1-123", "direction": "send" }
wad_ws { "action": "rewrite", "id": "ws1-123", "direction": "send",
         "find": "gold", "replace": "gem" }
wad_ws { "action": "rewrite", "id": "ws1-123", "direction": "recv",
         "find": "^\\{", "replace": "{\"injected\":1,", "regex": true }
```

## 7. Close and clear

```
wad_ws { "action": "close", "id": "ws1-123", "code": 1000, "reason": "debug" }
wad_ws { "action": "clear" }
```

## Gotchas

| Symptom | Cause |
|---|---|
| `E_NO_WS_CTX` | mini-program not running |
| `E_NO_WS_TASK` | the socket already closed; reopen it from the page |
| Session missing from `list` | opened before capture was enabled |
| Rewrite seems ignored | another rule also matches; `wad_ws { action: "get" }` shows the session rules |
