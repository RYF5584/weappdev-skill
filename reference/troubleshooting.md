# Troubleshooting

Errors carry `{ok, error, message, retryable, hint}`. **The hint tells you the next call to make** —
prefer it over retrying the same request.

## Pure-protocol risk codes (/ilink responses)

`wad_ilink` / `POST /v1/ilink/*` return `{ok, code, category, retryable, message, data}`. When
`ok:false`, `code` is an upstream ret. Three signatures matter:

| `code` | `category` | Meaning | What to do |
|---|---|---|---|
| `-12030` | `risk` | **Account-level risk control** — the whole account is restricted on the pure-protocol path; every mini-program is theoretically unopenable this way. The WeChat client itself keeps working. | Stop retrying. Wait (it can lift on its own) or switch accounts (`wad_account {action:"switch_account"}`), then probe with a single cheap `js-login` before resuming bulk work. |
| `-12028` | `risk` | **App-level risk control** — this appId is restricted. Two cases: *temporary throttling* (recovers after minutes/hours) or *permanent app flag* (rare — every account gets `-12028` for this app, WeChat still opens it). | Try the same appid once from another account. If it also fails, treat as permanent and fall back to runtime capture inside the container. Otherwise wait and retry slowly. |
| `61010` | `usage-record` | **Code expired** — the mini-program is not in the account's recent-usage list, so issued login codes die immediately. | `js-login` already auto-healed once (see `data.healed`). Manual fix: `wad_ilink {action:"update-wxa-usage-record", appid}` then retry `js-login` with `"no_heal": true`. |

### `code: -103006` — "system error" from the cloud gateway

Almost always a **malformed request on your side**: wrong field name, bad JSON escaping, stale
`call_id`/`cli_req_id`/`session_id`, missing `tcbapi_getenvauth` for cloud functions, or headers
as a map instead of a `{k,v}` array. **Diff against a fresh capture of the same app before
blaming the platform** — real parameter sets often differ from templates. Only in a small
minority of apps does `-103006` mean "this app's backend does not accept the protocol path";
treat that as the last possible explanation, never the first.

Any other non-zero `code` shows `category:"upstream"` with the raw ret in `message`.

## Tool-level errors (from the phone)

| Code | Meaning | Next step |
|---|---|---|
| `E_NO_TARGET` | no render/panel target | `wad_open_app`, or `wad_app { action:"restart", hard:true }` |
| `E_STALE_UID` | snapshot generation is gone | `wad_take_snapshot` again, pass the new `rev` |
| `E_STALE_SCRIPT` | script ids changed (page/app restart) | `wad_list_scripts` again |
| `E_APP_GONE` | the mini-program closed or switched | `wad_open_app` |
| `E_LOGIC_DOWN` | logic layer not available | `wad_status`; restart the app if it stays down |
| `E_CTX_DEAD` | execution context destroyed | retry once, then `wad_debug { action:"recover" }` |
| `E_PAUSE_OWNER` | something else owns the pause | `wad_pause_or_resume { action:"resume" }` |
| `E_TARGET_BUSY` | CDP target busy | retry after a beat |
| `E_SOURCE_TOO_LARGE` | script too big for one response | `wad_save_script_source`, read locally |
| `E_TIMEOUT` | the tool handler exceeded ~45s | `wad_status deep`-style check, then retry |
| `E_HTTP` / `E_HTTP_TIMEOUT` | `wx.request` failed inside the mini-program | check URL/headers, `wad_open_app` first |
| `E_BUSY` | too many concurrent tool calls | reduce parallelism |
| `E_BAD_ARGS` | argument validation failed | read `message` |
| `E_UNSUPPORTED` | that layer does not support the action | see `wad_capabilities` |
| `E_NO_PANEL` / `E_PANEL_TIMEOUT` | plugin panel not open / bridge timed out | `wad_plugin { action:"panel_open" }`, then retry |
| `E_NO_WS` / `E_NO_WS_TASK` | WebSocket session unknown or already closed | `wad_ws { action:"list" }`; reopen from the page |
| `E_NO_WS_CTX` | no usable logic-layer context | the mini-program is not running |
| `E_UNKNOWN_TOOL` | the phone does not have that tool name | `wad_tools { action:"list" }` |
| `E_INPUT_TIMEOUT` | input event never reached the page | the mini-program is not in front; close others or restart hard |

## Aggregator-level errors

| Code | Meaning | Next step |
|---|---|---|
| `E_NO_DEVICE` | nothing discovered | `adb devices`, app running, `--scan`, or seed file |
| `E_AMBIGUOUS_DEVICE` | several phones online, none chosen | `wad_device_use`, or pass `device` |
| `E_UNKNOWN_DEVICE` | alias/uuid/URL did not match | `wad_devices` |
| `E_UNSUPPORTED_BY_DEVICE` | this phone's app lacks the tool | use `wad_tools` to see its real set, or upgrade |
| `E_BAD_BASE_URL` | the URL is not a WeAppDev gateway | verify `http://host:port` and that the app runs |
| `E_DEVICE_TIMEOUT` | 60s without a response — **not retried** | `wad_status`; confirm the phone screen is on |
| `E_SESSION_LOST` | re-attach also returned 404 | the phone is restarting; try again |
| `E_DEVICE_HTTP` / `E_DEVICE_BAD_JSON` | unexpected response from the phone | check `hint`, restart the app |

Why timeouts are never retried: a retried `wad_click` would click twice. Only failures that
**definitely did not execute** (`ECONNREFUSED`, `ECONNRESET`, HTTP 404) are retried, once.

## Symptom-first diagnosis

| What you see | Most likely cause | Check |
|---|---|---|
| Every tool returns `E_NO_TARGET` | no mini-program open, or another one owns the container | `wad_list_apps`; close the other app |
| `wad_status` shows `logic: false` | app still starting, or the runtime died | wait 10–20s; `wad_app restart hard:true` |
| Network list is empty but the page works | capture enabled too late | enable capture, then re-trigger |
| Cloud list is empty | cloud traffic needs `wad_cloud set_capture` | `wad_cloud { action:"status" }` |
| Native list is empty | `kind:"native"` capture off | `wad_capture { action:"set", kind:"native", enabled:true }` |
| Breakpoint stays `pending` | the code was never loaded | navigate to the page that loads it, or `wad_break_on_xhr` |
| Click does nothing | another mini-program is in front | `wad_status`, close others, restart hard |
| Fill has no effect | custom component input | `wad_interact { action:"type_text" }` |
| Panel blank | exception in the panel script | `wad_plugin { action:"logs", id }` |
| Plugin logs missing | the plugin never injected | `wad_plugin { action:"state" }`, check logic layer |
| Two phones give contradictory results | you are talking to different devices | `wad_devices`, pin with `wad_device_use` |
| Device found but calls time out | port changed in the app and the aggregator is stale | `wad_devices` → `devicePort`; restart the aggregator |

## Reading `wad_status` properly

`wad_status` is a bundle, not a single value:

| Field | What to look at |
|---|---|
| `status.instanceId` | which phone answered — compare it when results seem contradictory |
| `apps[]` | `logic` must be true; `render` needed for UI tools; `foreground` tells who is in front |
| `config` | inspector on/off, capture switches, plugin global switch |
| `plugins` | how many installed, whether the global switch is on |

## When a tool returns success but nothing happened

`ok: true` means the call was accepted, not that the page changed. Verify with an independent
observation:

- after a click: `wad_take_snapshot` and compare, or `wad_dom { action:"mutation" }`
- after a rewrite: `wad_get_network_request` on the next matching request
- after a breakpoint action: `wad_list_breakpoints` hit counts
- after enabling capture: make one new request and confirm it appears

Hover is special: it has no side effect, so a failure only shows up as `dispatched: false`.

## Escalation order

1. `wad_status` — is the environment what you think it is?
2. `wad_list_apps` — is the target actually running?
3. `wad_tools { action: "groups" }` — does the phone even have the tool?
4. Restart the target: `wad_app { action: "restart", hard: true }`
5. Restart the app on the phone (the user does this; it invalidates sessions, which the aggregator
   re-attaches automatically)


## E_LAUNCH_FAILED — the mini-program did not actually start

`wad_open_app` returns this in ~4s (not 20s). It means WMPF accepted the launch request
but **no instance was created**: there is no logic target and no real page target for that
appId. The device screen normally shows a toast with the precise reason.

Do **not** retry in a loop and do **not** escalate to `killRuntime` blindly. Useful actions:

1. `wad_search_apps {q:"<name>"}` → confirm the APPID is right (a wrong/typo'd APPID and a
   delisted app look identical here).
2. `wad_status` → is another mini-program occupying the container? Close it, then retry.
3. `wad_app {action:"restart", appid:"<other>"}` → container occasionally holds a stale
   instance; hard restart then reopen the target.
4. Ask the user to confirm the mini-program still exists in WeChat (it may have been taken offline).

A **suspended / backgrounded** app is *not* a failure — `ok:true` with `state:"suspended"`
is a normal successful launch.

## Screenshot errors

| Code | Meaning | Fix |
|---|---|---|
| `E_NO_RENDER_TARGET` | Mini-game has no XWeb target **and** the container is unreachable, so the PixelCopy fallback could not run | Check the container process is alive (`wad_status.hooks.logicLayer`); reopen the game |
| `E_GRAB_FAIL` | Container reachable but PixelCopy failed (no foreground window / SurfaceView not ready) | Wait ~1s after launch, or use `wad_take_snapshot` / game-state probing instead |
| `E_SCREENSHOT` | CDP `Page.captureScreenshot` failed | Retry once; if it persists the render target is wedged → `wad_app action=restart` |
