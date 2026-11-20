# Connecting: direct phone vs aggregator

There are **two ways** to reach the same 64 tools. Which one you have changes what you must (and
must not) do. Detect it on the first call.

## How to tell them apart

| Signal | Direct phone | Aggregator |
|---|---|---|
| Tools `wad_devices` / `wad_device_use` exist | no | **yes** |
| Tools accept a `device` parameter | no | **yes** |
| `initialize` → `serverInfo.name` | `weappdev` | `weappdev-mcp` |
| `wad_status` returns `status.instanceId` | yes | yes, of the routed phone |

Quick check: call `wad_capabilities { search: "device" }`. If `wad_devices` appears, you are on the
aggregator.

## Direct phone mode

The MCP server runs inside the Android app; you are talking to exactly one phone.

```
wad_status                       # nothing else is needed
wad_list_apps
```

- No `device` argument anywhere. Passing one is harmless (the phone ignores unknown fields) but
  pointless.
- `E_NO_TARGET` / "no mini-program" is literal: open one with `wad_open_app`.
- This is the right mode when the user says "my phone" and there is only one.

## Aggregator mode

`weappdev-mcp` (stdio) sits in front of one or more phones.

```
wad_devices                      # count, alias, model, transports, mcpVersion, mcpApiLevel, devicePort
wad_device_use { device: "0017f447" }   # pin for this session (process-local)
wad_status                       # goes to the pinned phone
```

### Device identifiers

`device` accepts three forms, all resolved from the same in-memory index (no rescanning):

| Form | Example | When to use |
|---|---|---|
| alias | `0017f447` | default; it is what `wad_devices` prints |
| install UUID | `wad-0017f44719ad4904a7dc9aeda2b455dd` | when you need an identifier that never changes |
| base URL | `http://192.168.1.5:9400` | when you know the address but it is not discovered |

### Routing order (deterministic — it never guesses)

1. explicit `device` on the call
2. this process's pin (`wad_device_use`)
3. exactly one phone online → use it
4. several online and none specified → `E_AMBIGUOUS_DEVICE` **with the alias list**

So multi-device work always starts with `wad_device_use`. Two AI sessions on two phones do not
interfere: each session is its own process with its own pin.

### Session scope

The pin lives in the aggregator process. If a client shares one process across conversations, the pin
is shared too — then always pass `device` explicitly. Most clients spawn one process per session.

## MCP vs REST: same server, two shapes — do not mix them up

The phone exposes the **same** capabilities as MCP tools (`/mcp`) and REST routes (`/v1/*`).
Two differences bite people; both are measured, not theoretical:

1. **Argument shape.** MCP tool arguments are **flat**. The REST `/v1/ilink/*` endpoints take a
   JSON **body**. Example — the same gateway replay:

   ```jsonc
   // MCP (wad_ilink): envelope fields live at the TOP level of arguments
   { "action": "js-operate-wx-data", "appid": "wx…", "api_name": "qbase_commapi",
     "data": { …qbase envelope… }, "operate_directly": false, "env": 1 }

   // REST (POST /v1/ilink/js-operate-wx-data): the whole envelope IS the body
   { "appid": "wx…", "api_name": "qbase_commapi", "data": { … }, "operate_directly": false, "env": 1 }
   ```

   The failure signature of getting this wrong is misleading: MCP returns
      ```json
   {"ok":false,"code":-1,"message":"api_name 不能为空"}
   ``` (="api_name is empty") — it looks like "the backend rejected
   it", but actually your nested `body` object was never unwrapped. **If an MCP ilink/jsop call
   fails with an empty-argument message, flatten your JSON before debugging the protocol.**

2. **Error surface.** MCP wraps tool failures as `isError` + `structuredContent.{ok,code,…}`;
   REST returns plain JSON with `ok:false`. Same classification underneath
   (`risk` / `usage-record` / `upstream`), so the [troubleshooting](troubleshooting.md) tables apply
   to both.

## Use the configured MCP — do not silently bypass it

- If the user has **Studio (aggregator) MCP installed**, use its tools directly. Do not fall back
  to shelling out to `scripts/mcp_call.py` or raw `curl` against the phone **just because a call
  feels awkward** — the aggregator forwards every tool and adds `wad_devices`/`wad_device_use`.
- Shell helpers (`scripts/mcp_call.py`, `scripts/mcp-call.mjs`, `curl`) exist for **environments
  with no configured MCP client**, for CI, and for one-off reproduction. Using them while a
  configured MCP sits idle hides failures from the user's own tooling.
- If the user has **no MCP configured**, offer to set it up (one config line):

  ```jsonc
  // phone-direct (no Node needed) — put the phone's LAN IP in the URL
  { "mcpServers": { "weappdev": { "url": "http://<phone-ip>:9400/mcp" } } }
  // aggregator (needs Node 22+)
  { "mcpServers": { "weappdev": { "command": "npx", "args": ["-y", "@ryf5584/weappdev-mcp"] } } }
  ```

  Both expose the same 64 tools; the aggregator adds multi-device selection.

## Connection fails? Ask the user for the phone address FIRST

Before burning turns on discovery debugging: **ask the user for the WeAppDev phone's IP and port.**
The app displays both on the phone — open WeAppDev → **Dev config** and read the bound address +
port (default `9400`, but it auto-falls-forward to 9401/9402/… when busy, so **always take the port
the app actually shows**). The screen label, verbatim:

```
Dev config (开发配置)  →  绑定地址 + 端口
```

(The CJK above is the on-screen label itself — match it visually when guiding the user.)

Then pick the config that matches the user's setup:

```jsonc
// Direct HTTP (client server name is usually "weappdev-http") — no Node needed:
{ "mcpServers": { "weappdev-http": { "url": "http://<phone-ip>:<port>/mcp" } } }

// Studio aggregator (server name "weappdev") — add the phone as a LAN device:
// the aggregator auto-discovers USB (adb) and mDNS (LAN); for a phone it did
// not find, pass the base URL as the device identifier:
wad_devices { }                                            // see what is already visible
wad_device_use { device: "http://<phone-ip>:<port>" }      // pin by URL
```

Sanity-check the address before configuring anything:

```bash
curl http://<phone-ip>:<port>/v1/status     # {"running":true,...} = the address is good
```

If `/v1/status` answers, the MCP config above WILL work. If it does not answer: phone and computer
must share the network (same LAN / hotspot), the WeAppDev app must be in the foreground at least
once after boot, and port 9400 (or the configured one) must not be blocked by the phone's firewall
policy.

## "No device" checklist

Run `scripts/check-env.sh` first, then:

| Symptom | Check |
|---|---|
| `E_NO_DEVICE` | `adb devices` shows the phone? The app is running? Is the mini-program host app in the foreground at least once after boot? |
| Phone found over LAN but not USB | `adb devices` empty → USB debugging off, or the cable is charge-only |
| Found but every call times out | Wrong port forwarded. The app's **Dev config** shows the gateway port; `wad_devices` reports it as `devicePort` |
| `E_AMBIGUOUS_DEVICE` | Two phones online: call `wad_device_use` |
| `E_UNKNOWN_DEVICE` | The alias is stale — call `wad_devices` again, aliases can change if the phone reinstalled |
| `E_UNSUPPORTED_BY_DEVICE` | That phone's app is older than the tool. `wad_tools { action: "list" }` shows its real set |

## Ports

MCP (`/mcp`), CDP (`/devtools/*`, `/json/*`) and the app's internal API (`/v1/*`) share **one** port.
**9400 is only the default**, configurable in the app under *Dev config* → port. If the preferred
port is occupied (another process holds it), the gateway **auto-falls-forward** (9401, 9402, …
up to +39) and publishes the real port to all consumers at once: `/v1/status → gateway.port`,
`/v1/config → bound_port` (+ `port_fallback:true`), `files/gateway_port.txt` (for the USB
aggregator), and mDNS (for LAN discovery). Nothing hardcodes 9400 — always read the actual port
from `/v1/status` or `gateway_port.txt`. When the app process dies, the port is released with it
(OS socket lifecycle); on next launch it re-binds starting at the preferred port again.

After changing the port in Dev config the app must be restarted; it then rewrites the advertised
port so the aggregator reconnects on its own. You do not need to forward anything manually — the
aggregator uses `adb forward tcp:0`.

## Multi-phone workflow

```
wad_devices
wad_device_use { device: "phoneA" }
wad_open_app  { appid }            # runs on phoneA
# … work on phoneA …

wad_status    { device: "phoneB" } # temporary switch, pin unchanged
wad_device_use { device: "phoneB" }# move the pin
```

State is per phone: a mini-program open on A does not exist on B, and snapshot `uid`s are never valid
across devices.
