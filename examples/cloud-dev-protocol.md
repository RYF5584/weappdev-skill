# Example: cloud-development calls by protocol (gateway / container / function)

Scenario: the user wants a cloud-dev call replayed or collected **without opening the
mini-program**, or wants to know which transport a cloud call uses and how to redo it outside the
container. Companion pages: [reference/pure-protocol.md](../reference/pure-protocol.md) and
[reference/cloud-capture.md](../reference/cloud-capture.md).

## 0. Recognize what you are looking at (client-side API shapes)

| Mini-program client code | Cloud resource | Native qbase api |
|---|---|---|
| `const g = wx.cloud.services.Gateway({ domain })` then `wx.cloud.gateway.call(...)` | **Gateway** ([quickstart](https://developers.weixin.qq.com/miniprogram/security/gateway/start/quickstart.html)) | `tcbapi_call_gateway` |
| `const c1 = new wx.cloud.Cloud({ resourceAppid: 'WXAAA', resourceEnv: 'prod_001 }); await c1.init(); await c1.callContainer(...)` | **Container / cloud-run** ([docs](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/mini.html)) | `tcbapi_call_container` |
| `wx.cloud.callFunction({ name, data })` | **Function** | `tcbapi_slowcallfunction_v2` |
| `wx.cloud.database()` / `wx.cloud.uploadFile` / … | other cloud-dev | respective `tcbapi_*` |

**Every one of them can be sent natively through `js-operate-wx-data(-by-api)`.** Gateway and
container additionally support the encrypted-HTTP route once you hold their credential.

## 1. Two channels per resource — and which one to pick

WeChat's client SDK decides the channel after asking `tcbapi_get_service_info`:

- **V3 encrypted HTTP** — client fetches `{token,key}` (`get_service_info`), then AES-CBC + Snappy
  + protobuf-packs the request to `https://<gw-host>/__wx__/call?token=…`.
- **Native direct (jsop)** — the whole call is a `tcbapi_call_gateway` / `tcbapi_call_container` /
  `tcbapi_slowcallfunction_v2` payload inside the `qbase_commapi` envelope.

Decision rule (measured): **follow the channel the mini-program itself uses** — check the capture
`link` field. The six literal values (verbatim, as the capture view renders them):

```
V3云网关   (V3 gateway)        Native云网关  (native gateway)
HTTP云托管 (HTTP container)    Native云托管  (native container)
V3云函数   (V3 function)       Native云函数  (native function)
```

If the HTTP route misbehaves (WAF 403, expired token, challenge), fall back to the native jsop
route — and vice versa. Both channels reach the same business backend.

For the HTTP route: `get-cloud-gateway-v3-token-key` / `get-cloud-container-token-key` → feed
`credential.{token,key}` into the Python SDK:

```bash
pip install wxcloud-gateway-sdk   # github.com/RYF5584/wxcloud-gateway-sdk
```

```python
from wxcloud_gateway_sdk import GatewaySyncClient, ContainerSyncClient
gw  = GatewaySyncClient(key=KEY,    domain=DOMAIN, token=TOKEN)          # V3 gateway
ctr = ContainerSyncClient(key=KEY, url=URL, timestamp=TS, env=ENV, service=SVC)
```

(The phone's own cloud capture has **already decrypted** both channels — check the capture first;
you may not need to send anything.)

## 2. Worked example A — gateway, native direct (measured end-to-end)

Capture shows the app calling `POST /base/location/getLocation` with body
`{"longitude":12.34,"latitude":56.78}` on gateway host
`abc123-wxXXXXXX.sh.wxcloudrun.com` (business URL `https://biz.example.cn/base/location/getLocation`).

```json
POST /v1/ilink/js-operate-wx-data
{
  "appid": "wxAAAAAAAAAAAAAAAA",
  "api_name": "qbase_commapi",
  "data": {
    "qbase_api_name": "tcbapi_call_gateway",
    "qbase_req": "{\"method\":\"post\",\"headers\":[
       {\"k\":\"content-type\",\"v\":\"application/json\"},
       {\"k\":\"X-Request-App-Code\",\"v\":\"<from capture>\"},
       {\"k\":\"InvokeType\",\"v\":\"inside\"},
       {\"k\":\"X-WX-HTTP-MODE\",\"v\":\"REROUTE\"},
       {\"k\":\"User-Agent\",\"v\":\"Mozilla/5.0 (Linux; Android 16; <device>) ... MicroMessenger/8.0.72.3100(0x28004853) ... MiniProgramEnv/android\"},
       {\"k\":\"referer\",\"v\":\"https://servicewechat.com/wxAAAAAAAAAAAAAAAA/0/page-frame.html\"},
       {\"k\":\"X-WX-HTTP-HOST\",\"v\":\"abc123-wxXXXXXX.sh.wxcloudrun.com\"},
       {\"k\":\"X-WX-HTTP-PATH\",\"v\":\"https://biz.example.cn/base/location/getLocation\"}],
     \"data\":\"{\\\"longitude\\\":12.34,\\\"latitude\\\":56.78}\",
     \"data_type\":0,\"action\":1,\"retryType\":0,
     \"call_id\":\"v2-1795173000000-kX7mQ2aB_\",\"user_timeout\":60000}",
    "qbase_options": {"rid": "23f3d79926e33569-1795173000000-edecbd0080aa6352", "rv": "2"},
    "qbase_meta": {"session_id": "1795172996100",
                   "sdk_version": "wx-miniprogram-sdk/3.16.2 (1783650485000 platform/android})"},
    "cli_req_id": "1795173000000_0.3843409316567097"
  },
  "operate_directly": false,
  "env": 1
}
```

Measured response:

```json
{ "ok": true, "code": 0,
  "data": { "payload": { "status": 1, "baseresponse": {"errcode": 0},
            "data": "{\"status\":\"Success\",\"code\":\"0\",\"message\":\"request success.\",\"data\":{\"province\":\"<Province>\",\"city\":\"<City>\",...}}" },
            "dataParsed": {"status":"Success","code":"0","data":{"province":"<Province>", ...}} } }
```

Checklist (all measured failures have one of these as the cause):

1. **UA must match the device** that ran `get_service_info`, else gateway WAF → 403. Copy the UA
   from a captured request of the same app.
2. `headers` is an **array of `{k,v}`** — not a JSON map.
3. `X-WX-HTTP-PATH` is the **full business URL** (business host + path + query); `X-WX-HTTP-HOST`
   is the gateway host. GET requests move query into PATH and leave `data` empty.
4. Fresh `call_id`/`cli_req_id`/`session_id` timestamps on every send.
5. `operate_directly:false` first; flip if the business auth rejects.
6. `code:-103006` = malformed envelope (escaping, field name, stale ids) — fix the request, don't
   retry blindly. The same request through `js-operate-wx-data-by-api` (inner object as `data`,
   envelope auto-built) is a good cross-check.

## 3. Worked example B — cloud function, both endpoints (measured)

`wx.cloud.callFunction` → `tcbapi_slowcallfunction_v2`. **Always bind env auth first**, otherwise
the call "succeeds" with an empty body:

```json
POST /v1/ilink/js-operate-wx-data-by-api
{ "appid": "wxBBBBBBBBBBBBBBBB", "qbase_api_name": "tcbapi_getenvauth",
  "data": { "env": "cloud1-XXXXXXXXXXXXXXXX" } }
```

Then the function call (note the **double-stringified** `data`):

```json
POST /v1/ilink/js-operate-wx-data-by-api
{ "appid": "wxBBBBBBBBBBBBBBBB", "qbase_api_name": "tcbapi_slowcallfunction_v2",
  "data": { "function_name": "myFn",
            "data": "{\"action\":\"getList\",\"month\":\"2026-11\"}",
            "action": 1, "scene": 1,
            "call_id": "1795173000001-0.4832", "cloudid_list": [] },
  "env": "cloud1-XXXXXXXXXXXXXXXX" }
```

Measured result:

```json
{ "ok": true, "code": 0,
  "data": { "payload": { "status": 1, "service_errcode": 0,
            "data": "{\"code\":0,\"message\":\"ok\",\"data\":{\"dateStatus\":{\"2026-11-21\":\"available\"}}}" },
            "dataParsed": {"code": 0, "message": "ok", "data": {"dateStatus": "…"}} } }
```

The same body works through raw `js-operate-wx-data` — wrap it yourself in `qbase_commapi`
(`qbase_req` = JSON string, `qbase_options.env` = the cloud env id).

## 4. Worked example C — login code / user key / HostSign (one-liners)

```json
POST /v1/ilink/js-login                              {"appid":"wxBBBB…"}
POST /v1/ilink/get-user-encrypt-key                  {"appid":"wxBBBB…"}
POST /v1/ilink/verify-plugin                         {"appid":"wxCCCC…","plugins":[{"provider":"wxDDDD…","inner_version":4}]}
```

Measured: `js-login` → `data.code`; encrypt-key → `data.payload.{encrypt_key,iv,…}`;
verify-plugin → `data.payload.list[0].{host_sign,noncestr,timestamp,request_domain}`.

## 5. Via MCP instead of REST

The same calls through `wad_ilink` — pass the envelope fields **flat** (the MCP flattens
arguments; do not nest the whole envelope under a `body` key):

```
wad_ilink { action: "js-operate-wx-data", appid: "wxAAAA…",
            api_name: "qbase_commapi", data: { …qbase envelope… },
            operate_directly: false, env: 1 }
wad_ilink { action: "js-login", appid: "wxBBBB…" }
```
