# UI automation: snapshot, click, fill, screenshot, wait

Drive the mini-program like a user, using stable element identity instead of coordinates.

## The loop

```
wad_take_snapshot  { "layer": "render" }        # → rev + nodes[].uid
wad_click          { "uid": "e12", "rev": "<rev>" }
wad_fill           { "uid": "e5", "value": "text", "rev": "<rev>" }
wad_take_screenshot{ }
```

`wad_take_snapshot` returns a compact tree: `uid`, `tag`, `role`, `name`, `text`, box and flags. It
also returns `rev` — a generation marker for that snapshot. Pass `rev` with actions so a stale element
fails loudly with `E_STALE_UID` instead of clicking whatever moved into that position.

## Reading a snapshot

| Field | Meaning |
|---|---|
| `uid` | stable id for this snapshot; **not** stable across snapshots |
| `tag` | WXA element (`wx-view`, `wx-text`, `wx-button`, …) |
| `name` / `text` | accessible name and rendered text |
| `box` | `[x, y, w, h]` in CSS pixels of the render target |
| `rev` | snapshot generation |
| `title` | `<appid>:<route>:VISIBLE` — confirms which page is in front |

`maxNodes` limits the tree size; `verbose: true` keeps extra fields for debugging. For a big page,
snapshot with a small `maxNodes`, then re-snapshot after scrolling.

## Acting on elements

```
wad_click { "uid": "e12", "rev": "..." }
wad_click { "text": "Confirm", "rev": "..." }       # by visible text
wad_click { "selector": ".submit", "rev": "..." }   # by CSS selector
wad_fill  { "uid": "e5", "value": "hello", "rev": "..." }
```

`wad_click` uses touch events (mini-program components listen for touch, not mouse). `wad_fill`
activates the element, writes the value and dispatches `input`/`change` so framework bindings fire.

`wad_interact` covers the rest:

```
wad_interact { "action": "click_at",   "args": { "x": 100, "y": 200 } }
wad_interact { "action": "scroll",     "args": { "uid": "e20", "deltaY": 300 } }
wad_interact { "action": "press_key",  "args": { "key": "Enter" } }
wad_interact { "action": "hover",      "args": { "uid": "e12" } }
wad_interact { "action": "type_text",  "args": { "value": "abc" } }
wad_interact { "action": "select_option", "args": { "uid": "e7", "value": "b" } }
```

Hover has no visible side effect, so a failure to dispatch returns `dispatched: false` rather than an
error — check it if the user expects a hover state.

## Reading the page directly

```
wad_dom { "action": "html" }
wad_dom { "action": "query",  "args": { "selector": "#app" } }
wad_dom { "action": "node",   "args": { "selector": "#app" } }
wad_dom { "action": "attrs",  "args": { "selector": "input" } }
wad_dom { "action": "styles", "args": { "selector": ".btn" } }
wad_dom { "action": "box",    "args": { "selector": ".btn" } }
wad_dom { "action": "mutation", "args": { "durationMs": 1000 } }
```

`layer: "panel"` targets the plugin panel WebView instead of the mini-program page. `mutation` is the
way to observe dynamic rendering instead of polling.

## Executing JS

```
wad_evaluate_script { "layer": "logic",  "expression": "getCurrentPages().length", "byValue": true }
wad_evaluate_script { "layer": "render", "expression": "document.body.innerText.length" }
wad_evaluate_script { "layer": "logic",  "function": "function(a){return a*2}", "args": [21] }
```

`byValue: true` returns the value; without it you get a remote object reference (useful for big
objects, then use `wad_cdp` / `wad_debug` to inspect properties).

## Waiting instead of sleeping

```
wad_wait_for { "text": "Order placed", "timeoutMs": 10000 }
wad_wait_for { "selector": ".toast", "timeoutMs": 5000 }
wad_wait_for { "route": "pages/result/index", "timeoutMs": 10000 }
wad_wait_for { "network": "/api/submit", "timeoutMs": 15000 }
wad_wait_for { "expr": "getApp().token", "layer": "logic" }
wad_wait_for { "appid": "wx...", "layer": "logic" }
```

Prefer these over fixed sleeps: they return as soon as the condition holds and report a timeout with
the last observed state when it does not.

## Screenshots

```
wad_take_screenshot { }                                        # JPEG q55 by default
wad_take_screenshot { "format": "png", "fullPage": true }
wad_take_screenshot { "uid": "e12" }                            # element region
wad_take_screenshot { "layer": "render", "quality": 80 }
```

The **plugin panel** is a system WebView and screenshotting it can hang; use `wad_take_snapshot
{ layer: "panel" }` or a host-side screen capture for that case. `wad_files { action: "download",
scope: "shots" }` retrieves saved screenshots to the PC.

## Batched flows

```
wad_batch {
  "ops": [
    { "tool": "wad_click",  "args": { "text": "Login" } },
    { "tool": "wad_wait_for", "args": { "selector": ".home", "timeoutMs": 8000 } },
    { "tool": "wad_take_snapshot", "args": { "layer": "render", "maxNodes": 40 } }
  ],
  "stopOnError": true
}
```

1–20 operations, executed in order. Saves round trips for deterministic flows. If you are on the
aggregator, the outer `device` is propagated to each op automatically.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `E_STALE_UID` | page changed since the snapshot | re-snapshot, then act |
| Click does nothing | the element is covered or off-screen | check `box`, scroll first, or use `click_at` |
| `E_TARGET_INVISIBLE` / `dispatched:false` | the mini-program is not the visible one | close the other mini-program or restart hard |
| Fill has no effect | input is a custom component | try `wad_interact { action: "type_text" }` |
| Screenshot of panel hangs | system WebView limitation | use a panel snapshot instead |
| Snapshot is huge | page renders many nodes | `maxNodes` + scroll-and-repeat |


## Screenshot → click workflow (what an AI actually does)

Both **mini-programs and mini-games** support screenshots without adb:

| Layer | Path | Notes |
|---|---|---|
| Mini-program | `POST /v1/surface/screenshot {layer:"render",format:"jpeg",quality:70}` | CDP `Page.captureScreenshot`, returns `png_b64` (base64 of the requested format) + `targetId` |
| Mini-game | same call | Automatically falls back to **container `PixelCopy`** (`mode:"container-pixelcopy-surfaceview"`) because a mini-game has no XWeb target. The image is the game canvas at its native size (e.g. 240×426) |

**Coordinate contract (critical):** the screenshot you get back is in **physical
pixels**, and `wad_interact click_at {x,y}` also takes **physical pixels** — so
*the pixel you see in the screenshot is exactly the coordinate you click*. No scaling.

Mini-program screenshots come back at the window's physical size (e.g. 1440×2560 on a
dpr=3 device). Mini-game screenshots come back at canvas resolution, so scale once:
`clickX = shotX * windowWidthPhysical / shotWidth` (on a 1440-wide device, a 240-wide
canvas shot needs ×6).

Recommended loop:

```
1. wad_take_screenshot {format:"jpeg", quality:70}     # or /v1/surface/screenshot
2. read the image, decide what to tap
3. wad_interact {action:"click_at", x, y}              # physical px, same frame as the shot
4. wad_take_screenshot again → confirm the UI changed
```

If a click has no visible effect, call `wad_take_snapshot` (element tree) to confirm the
node is really there before assuming the click failed — mini-games have no element tree,
so verify with `wad_debug {action:"evaluate_global"}` on the game state instead.

## Opening a mini-program: what "success" means

`wad_open_app` / `POST /v1/apps/open` now **verifies the instance was really created**
instead of trusting WMPF's dispatch callback (`errCode=0` only means "request accepted"):

- Success in ~1.7–2.2s typical: `{ok:true, opened:true}` and the app appears with a
  logic target or a real `servicewechat.com/<appid>/…` page target.
- A dead / unlaunched APPID returns in ~4s with
  `{ok:false, error:"E_LAUNCH_FAILED", causes:[…], hint:"<device toast text>"}` — `causes` lists the usual suspects (app taken offline / appId unknown / account lacks access / phone-WeChat-only / runtime error); the on-screen toast has the specific reason.
  — it does **not** hang for 20s and does **not** silently report success.
- `verifyMs` (1000–15000) tunes the verification window.
- A backgrounded (`suspended`) instance is still a successful launch.
