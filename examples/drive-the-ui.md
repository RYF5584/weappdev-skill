# Example: drive the UI and capture the result

Goal: open a mini-program, navigate it like a user, and prove what state it reached.

## 1. Open and confirm the render layer

```
wad_open_app { "appid": "wx1234567890abcdef" }
wad_status
```

You need `logic: true` and `render: true`. Render is what snapshot/click operate on.

## 2. Snapshot

```
wad_take_snapshot { "layer": "render", "maxNodes": 60 }
```

Read `title` — it looks like `<appid>:<route>:VISIBLE`, which confirms which page is in front. Then
find the node you want by `name`/`text`.

For a large page, snapshot with a small `maxNodes`, scroll, and snapshot again rather than pulling the
whole tree at once.

## 3. Act

```
wad_click { "uid": "e12", "rev": "<rev>" }               # by uid
wad_click { "text": "Login", "rev": "<rev>" }            # by visible text
wad_fill  { "uid": "e5", "value": "13800138000", "rev": "<rev>" }
```

Pass `rev` every time: a stale element then fails with `E_STALE_UID` instead of clicking whatever
moved into that spot.

## 4. Wait for the consequence, do not sleep

```
wad_wait_for { "selector": ".home", "timeoutMs": 8000 }
# or: { "text": "Signed in" } / { "route": "pages/home/index" } / { "network": "/api/login" }
```

## 5. Confirm

Two independent observations beat one:

```
wad_take_snapshot { "layer": "render", "maxNodes": 20 }
wad_take_screenshot { "format": "jpeg", "quality": 60 }
```

## 6. Batch a deterministic flow

```
wad_batch {
  "ops": [
    { "tool": "wad_fill",  "args": { "uid": "e5", "value": "13800138000" } },
    { "tool": "wad_click", "args": { "text": "Send code" } },
    { "tool": "wad_wait_for", "args": { "selector": ".code-input", "timeoutMs": 8000 } },
    { "tool": "wad_take_snapshot", "args": { "layer": "render", "maxNodes": 30 } }
  ],
  "stopOnError": true
}
```

Batches run in order and stop on the first failure when `stopOnError` is true.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `E_STALE_UID` | page changed since the snapshot | re-snapshot |
| Click has no effect | another mini-program is in front | close it, or `wad_app restart hard:true` |
| Fill ignored | custom input component | `wad_interact { "action": "type_text", "args": { "value": "..." } }` |
| Element off screen | outside the viewport | `wad_interact { "action": "scroll", "args": { "uid": "...", "deltaY": 300 } }` |

## Clean up

Dismiss any dialog you opened, and re-snapshot before handing back to the user so their view of the
page matches yours.
