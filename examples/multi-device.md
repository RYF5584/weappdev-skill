# Example: work on two phones without crosstalk

Goal: run the same inspection on two devices and keep their results separate.

This requires the **aggregator** (`wad_devices` exists). On a direct phone connection there is only
one device, so this scenario does not apply.

## 1. See both phones

```
wad_devices
```

Read `device` (alias), `model`, `transports`, `mcpVersion`, `mcpApiLevel` and `devicePort`. Aliases are
what you pass everywhere else.

## 2. Pin one, work on it

```
wad_device_use { "device": "phoneA" }
wad_open_app   { "appid": "wx1234567890abcdef" }
wad_status
```

Everything now goes to `phoneA` without repeating `device`.

## 3. Look at the other one, temporarily

```
wad_status { "device": "phoneB" }
```

The pin is unchanged: the next call without `device` is back on `phoneA`.

## 4. Move the pin

```
wad_device_use { "device": "phoneB" }
```

## What is per-device (and what is not)

| Per device | Shared |
|---|---|
| open mini-programs | the tool table (union of all devices) |
| snapshot `uid`s and `rev`s | the fleet tools themselves |
| capture buffers and rules | |
| plugin enabled/disabled state | |
| gateway port | |

Never reuse a snapshot `uid` from one phone on another: it will either fail with `E_STALE_UID` or, much
worse, match a different element.

## Parallel sessions

Each MCP client session is its own process with its own pin, so two AI conversations on two phones do
not interfere. If a client shares one process across conversations, always pass `device` explicitly.

## When several phones are online and you forget `device`

```
{ "ok": false, "error": "E_AMBIGUOUS_DEVICE",
  "message": "2 devices are online; specify one with `device`",
  "hint": "Call wad_device_use to pin a default, or pass `device` per call: phoneA / phoneB" }
```

That is deliberate: picking arbitrarily would silently mix two devices' state.

## Comparing the same flow on both phones

```
wad_device_use { "device": "phoneA" }
wad_open_app   { "appid": "<id>" }
wad_take_snapshot { "layer": "render", "maxNodes": 20 }

wad_device_use { "device": "phoneB" }
wad_open_app   { "appid": "<id>" }
wad_take_snapshot { "layer": "render", "maxNodes": 20 }
```

Compare `title`/`url` per device — the `targetId` values will differ, which is expected.
