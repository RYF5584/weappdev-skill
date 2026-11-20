# Pure-protocol calls (/ilink)

The `/ilink` plane talks to WeChat's CGI endpoints **directly from Rust** using the current
logged-in account session — the same wire format the WeChat client itself uses. It does **not**
go through the WMPF container, is invisible to capture/rewrite/hooks, and works even when **no
mini-program is open**. Use it whenever you need a login code, an encryption channel, a plugin
signature, or a cloud-develop­ment credential without spinning up the mini-program runtime.

## 1. The unified response envelope

Every `/v1/ilink/*` endpoint returns the same shape (mirrors the YYB protocol's `APIResponse`):

```json
{
  "ok": true,                  // business success flag (0 = OK)
  "code": 0,                   // upstream ret/errcode; 0 = success
  "category": "ok",            // ok | risk | usage-record | upstream | auth | input | internal
  "retryable": false,          // whether an identical retry can succeed
  "message": "success",        // human-readable explanation
  "data": { }                  // ALL business payload lives here — plaintext, never base64
}
```

Rules:

- Treat `ok:false` as a hard stop — do not parse `data` for business fields.
- `category` tells you *why* it failed and what to do next (see §5 risk playbook).
- Everything in `data` is plaintext JSON/fields. The old `body_b64` field is gone; protobuf
  responses are parsed server-side into `base_response`, `msg`, `code`, `payload`, etc.

## 2. Endpoint catalog

| Need | Endpoint (POST `/v1/ilink/…`) | MCP `wad_ilink` action |
|---|---|---|
| `wx.login()` equivalent (get code) | `js-login` | `js-login` |
| User-encryption channel key/iv | `get-user-encrypt-key` | `get-user-encrypt-key` |
| Plugin HostSign | `verify-plugin` | `verify-plugin` |
| Cloud gateway V3 credential | `cloud/get-cloud-gateway-v3-token-key` | `get-cloud-gateway-v3-token-key` |
| Cloud-run (container) credential | `cloud/get-cloud-container-token-key` | `get-cloud-container-token-key` |
| Arbitrary cloud-dev API (db/function/storage…) | `js-operate-wx-data` | `js-operate-wx-data` |
| Same, convenience form (api_name + data) | `js-operate-wx-data-by-api` | `js-operate-wx-data-by-api` |
| Fix "code expired" / seed recent-usage list | `update-wxa-usage-record` | `update-wxa-usage-record` |
| Fresh mini-program profile (name/avatar/sign) | `app_info` | `app_info` |

All of these are served by the phone's own REST server (`POST /v1/ilink/<name>`), so the MCP
tool `wad_ilink` and a plain HTTP call reach the same code path.

## 3. Worked examples

### 3.1 js-login — get a login code (wx.login equivalent)

```json
POST /v1/ilink/js-login
{ "appid": "wx1234567890abcdef" }
```

Success:

```json
{
  "ok": true, "code": 0, "category": "ok", "retryable": false, "message": "success",
  "data": {
    "ilink": "js-login", "appid": "wx1234567890abcdef",
    "cgi": "/cgi-bin/mmbiz-bin/js-login",
    "body_bytes": 54,
    "base_response": { "ret": 0, "err_msg": "" },
    "code": "0b3SampleCodeSampleSample12SampleCodE"
  }
}
```

`data.code` is the login code — valid ~5 minutes, single-use, hand it to whatever the reversed
algorithm needs. Optional: `"no_heal": true` disables the 61010 auto-heal (§5.3).

### 3.2 get-user-encrypt-key — user encryption channel

Equivalent to `wx.getUserCryptoManager().getLatestUserKey()`
([official docs](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/user-encryptkey.html)):

```json
POST /v1/ilink/get-user-encrypt-key
{ "appid": "wx1234567890abcdef" }
```

`data.payload` carries the decoded business JSON (`encrypt_key`, `iv`, `version`, `expire_in`,
`create_time`). Use it to decrypt `encryptedData` payloads or to seed a session-based
encryption channel that the mini-program's algorithm depends on.

### 3.3 verify-plugin — plugin HostSign (X-WECHAT-HOSTSIGN)

Mini-program plugins sign their outbound `wx.request` calls with an `X-WECHAT-HOSTSIGN` header;
this endpoint produces the same signature material. `plugins` elements use
**`{provider, inner_version}`** — provider = the *plugin's* appId, inner_version = integer:

```json
POST /v1/ilink/verify-plugin
{ "appid": "wx1234567890abcdef",
  "plugins": [ { "provider": "wxfedcba0987654321", "inner_version": 4 } ] }
```

Measured response (abridged):

```json
{ "ok": true, "code": 0,
  "data": { "payload": { "list": [ {
      "plugin_id": "wxfedcba0987654321",
      "host_sign": "<40-hex host_sign>",
      "noncestr": "<32-hex noncestr>",
      "timestamp": 1700000000,
      "request_domain": ["https://plugin.example.com", "..."],
      "banning": {"hint": ""} } ] } } }
```

`data` alone (no `plugins`) defaults to the upstream default data domain
(`webapi_getuserinfo` + `with_credentials`).

### 3.4 Cloud gateway V3 credential (then leave WeAppDev if you want)

```json
POST /v1/ilink/cloud/get-cloud-gateway-v3-token-key
{ "appid": "wx1234567890abcdef", "domain": "<gateway domain of the mini-program>" }
```

`data.credential` = `{token, key, iat, exp, rid}`. Feed `key` into the `wxcloud-gateway-sdk`
client to build/encrypt gateway requests yourself, or keep calling through WeAppDev.

### 3.5 Cloud-run (container) credential

```json
POST /v1/ilink/cloud/get-cloud-container-token-key
{ "appid": "wx1234567890abcdef", "domain": "<container domain>" }
```

`data.credential` = `{token, key, iat, exp, rid, service_url?}`.

### 3.6 js-operate-wx-data — arbitrary cloud-dev API

Raw envelope form (you control the full `qbase_commapi` request):

```json
POST /v1/ilink/js-operate-wx-data
{ "appid": "wx1234567890abcdef", "inner": { "api_name": "qbase_commapi", "data": { "...": "..." } } }
```

Convenience form (envelope built for you):

```json
POST /v1/ilink/js-operate-wx-data-by-api
{
  "appid": "wx1234567890abcdef",
  "api_name": "tcbapi_slowcallfunction_v2",
  "data": { "env": "<env-id>", "function_name": "login", "data": "{\"foo\":1}" },
  "operate_directly": false,
  "env": 1
}
```

Plaintext business result lands in `data.payload` (the decoded `data` domain). Cloud-function
calls need the double-stringified `data` field shown above — the cloud-function parameter is a
JSON string inside the request JSON.

### 3.6b Native gateway direct (`tcbapi_call_gateway`) — measured template

A gateway call (`wx.cloud.services.Gateway({domain}).call(...)`) travels **either** as V3
encrypted HTTP (`/__wx__/call?token=…`) **or** as a native jsop call — the client SDK picks the
channel after `tcbapi_get_service_info`. To replay natively, wrap the gateway request in the
qbase envelope. **Measured working template** (real capture, replace the timestamps/randoms):

```json
POST /v1/ilink/js-operate-wx-data
{
  "appid": "wxAAAAAAAAAAAAAAAA",
  "api_name": "qbase_commapi",
  "data": {
    "qbase_api_name": "tcbapi_call_gateway",
    "qbase_req": "{\"method\":\"post\",\"headers\":[
        {\"k\":\"content-type\",\"v\":\"application/json\"},
        {\"k\":\"X-Request-App-Code\",\"v\":\"<business app code from capture>\"},
        {\"k\":\"InvokeType\",\"v\":\"inside\"},
        {\"k\":\"X-WX-HTTP-MODE\",\"v\":\"REROUTE\"},
        {\"k\":\"User-Agent\",\"v\":\"<Android MiniProgram UA — MUST match the get_service_info device>\"},
        {\"k\":\"referer\",\"v\":\"https://servicewechat.com/<appid>/0/page-frame.html\"},
        {\"k\":\"X-WX-HTTP-HOST\",\"v\":\"<gateway host, e.g. abc123-wxXXXX.sh.wxcloudrun.com>\"},
        {\"k\":\"X-WX-HTTP-PATH\",\"v\":\"https://<business host>/<full path>?<query>\"}],
      \"data\":\"{\\\"field\\\":\\\"value\\\"}\",\"data_type\":0,\"action\":1,
      \"retryType\":0,\"call_id\":\"v2-<ms>-<8 random chars>_\",\"user_timeout\":60000}\",
    "qbase_options": { "rid": "<32hex>-<ms>-<16hex>", "rv": "2" },
    "qbase_meta": { "session_id": "<ms>",
                    "sdk_version": "wx-miniprogram-sdk/3.16.2 (<ms> platform/android})" },
    "cli_req_id": "<ms>_0.<16 random digits>"
  },
  "operate_directly": false,
  "env": 1
}
```

Hard-won rules (all measured):

- **UA alignment**: the `User-Agent` header inside `qbase_req` must be an **Android
  MiniProgramEnv UA consistent with the device that ran `get_service_info`**, otherwise the
  gateway WAF answers **403**. Copy the UA from a captured request of the same app when possible.
- `X-WX-HTTP-HOST` = gateway host; `X-WX-HTTP-PATH` = the **full business URL** (business host +
  path + query). `data` is the JSON-stringified body; GET moves query params into `path`.
- `headers` is an **array of `{k,v}`** objects, not a map.
- `operate_directly:false` first; some apps' endpoints only pass auth with it — flip to test both.
- `code:-103006` almost always means **your envelope is malformed** — wrong field name, bad
  escaping, stale timestamps/ids, missing `getenvauth` for functions. **Compare against a fresh
  capture of the same app before concluding anything**; the real request's fields often differ
  from any template. In rare cases (a small minority of apps) `-103006` also appears for apps
  whose backends simply do not accept the protocol path — but treat that as a last resort,
  never the first explanation. `code:-12028` means the app is risk-flagged (§5.2).
- The `js-operate-wx-data-by-api` convenience form takes the *inner* object directly:
  `{appid, qbase_api_name:"tcbapi_call_gateway", data:{method, headers, data, data_type, action,
  retryType, call_id, user_timeout}, operate_directly:false, env:1}` — the envelope (`qbase_meta`,
  `cli_req_id`, …) is built for you.

### 3.7 update-wxa-usage-record — add a mini-program to the account's recent list

```json
POST /v1/ilink/update-wxa-usage-record
{ "appid": "wx1234567890abcdef" }
```

or address it directly:

```json
POST /v1/ilink/update-wxa-usage-record
{ "username": "gh_1a2b3c4d5e6f" }
```

Only `username` (original ID, `gh_` prefix, a missing `@app` suffix is added automatically) or
`appid` is required; when you pass `appid` the server resolves the username via `app_info`
itself. Optional tuning: `scene` (default 1047), `record_type` (2), `op_type` (1). Success is
`data.base_response.ret == 0` (folded into `code`).

### 3.8 app_info — fresh profile lookup

```json
POST /v1/ilink/app_info
{ "appid": "wx1234567890abcdef" }
```

`data.payload` = `{ok, appid, username, nick_name, signature, avatar, version, client_version,
update_time, attrs}`. This is the **live** attribute-sync CGI, not the local cache — use it to
map `appid ⇄ username`, which §3.7 and cloud domains often need.

## 4. Choosing between runtime capture and pure protocol

| Situation | Use |
|---|---|
| Need `code`/`key`/HostSign **without opening** the mini-program | `/ilink` plane |
| Need to observe/modify what the mini-program itself sends | capture + rewrite scripts |
| Need the exact envelope the app builds (signing research) | `wad_network` / `wad_cloud` capture |
| Need to replay a captured cloud call verbatim | replay in `wad_cloud`, or rebuild with §3.6 |

## 5. Risk-control playbook (read before automating)

The upstream flags requests made outside the official client. Three signatures matter:

### 5.1 `code: -12030` — account-level risk control

- **Who is affected:** the whole account on the pure-protocol path. Every mini-program is
  theoretically unopenable through the protocol while the flag lasts.
- **What still works:** the WeChat client itself behaves normally on the same account, and the
  WeAppDev container runtime is unaffected.
- **What to do:** stop hammering — identical retries do not help. Wait (the flag can lift on
  its own), or switch accounts (`wad_account { action:"switch_account" }`) and retest with a
  single cheap `js-login` before resuming bulk work.
- `retryable` is `true` but only after a cooldown, not immediately.

### 5.2 `code: -12028` — app-level risk control

Two distinct cases, same code:

| Case | Signature | Outcome |
|---|---|---|
| **Temporary throttling** | one account, one app, starts working again after minutes/hours | wait and retry slowly |
| **Permanent app-level flag** (rare) | every account gets `-12028` for this app on `js-login` / gateway / container / function calls; WeChat itself opens it fine | pure protocol is dead for this app; fall back to runtime capture inside the container |

To distinguish them: try the same `appid` with a different account once. If it also returns
`-12028`, treat the app as flagged (case 2) and stop retrying across accounts.

### 5.3 `code: 61010` — code expired (usage-record gate)

`{"errcode":61010,"errmsg":"code is expired rid: …"}` means the mini-program is **not in the
account's recent-usage list**, so login codes it issues are dead on arrival.

- `js-login` **auto-heals**: it calls `update-wxa-usage-record` internally (resolving the
  `gh_` username via `app_info`), then retries once. The attempt is reported in
  `data.healed` = `{trigger, username, ok, retried, ret_after}`.
- If `data.healed.retried` is true and `code` is still non-zero after the retry, escalate:
  run §5.2's check (the app may additionally be flagged), or update the record manually and
  retry `js-login` with `"no_heal": true` after a short pause.
- Manual fix without calling js-login: §3.7 directly.

### 5.4 Interpreting the envelope in one glance

```text
ok:true  code:0            → good, read data.*
ok:false code:-12030       → account risk-control, cooldown, maybe switch account
ok:false code:-12028       → app risk-control, wait / fallback to runtime capture
ok:false code:61010        → usage-record gate; js-login already auto-healed once — see data.healed
ok:false category:upstream → upstream returned an error; message carries ret=<n>
```
