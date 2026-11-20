# Example: write, install and verify a plugin

Goal: a plugin that changes one field in a response, then install it and prove it works.

## 1. Write the file

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="wad:package"     content="vip-flag">
  <meta name="wad:name"        content="VIP flag">
  <meta name="wad:version"     content="1.0.0">
  <meta name="wad:description" content="Forces data.vip to 1 on native responses">
</head>
<body>
  <h3>VIP flag</h3>
  <div id="out">waiting…</div>

  <script type="text/wad-logic">
    wad.on('attach', function (appid) { wad.log('attach ' + appid); });

    wad.on('nativeResp', function (d) {
      var o;
      try { o = JSON.parse(d.body); } catch (e) { return; }
      if (o && o.data && o.data.vip === 0) {
        o.data.vip = 1;
        wad.log('patched vip');
        return o;          // returning an object replaces the body
      }
      // returning nothing leaves the payload untouched
    });
  </script>

  <script>
    wad.on('attach', function (appid) {
      document.getElementById('out').textContent = 'attached to ' + appid;
    });
  </script>
</body>
</html>
```

Return values must be JSON-serialisable: a handler that returns an object is stringified by the bus, so
`JSON.stringify` it yourself when the panel needs structure.

## 2. Install it

```
wad_install_plugin { "html": "<the file contents>", "enable": true }
```

The install pre-checks every inline script: a syntax error returns `E_SYNTAX` and writes nothing.

```
wad_list_plugins { "enabled": "all" }
```

Confirm the `id`, name, version and enabled flag.

## 3. Verify it injected

```
wad_plugin { "action": "state" }
wad_plugin { "action": "logs", "id": "<pluginId>", "args": { "tail": 50 } }
```

You should see `attach <appid>`. No `attach` means the logic layer was not alive when the plugin was
enabled — open the mini-program and reload the plugin:

```
wad_plugin { "action": "reload", "id": "<pluginId>" }
```

## 4. Prove the behaviour changed

Trigger the traffic that used to return `vip: 0`:

```
wad_capture { "action": "set", "kind": "native", "enabled": true }
# … drive the page …
wad_native  { "action": "list", "tail": 50 }
```

Compare the response before and after enabling the plugin. The plugin's `logs` should also show
`patched vip`.

## 5. Package it for the market

```
zip -r vip-flag.zip vip-flag.html README.md logo.png
```

Keep `wad:package` stable across versions and bump `wad:versionCode` so the market can show an update.

## 6. Remove it

```
wad_plugin { "action": "set_enabled", "id": "<pluginId>", "args": { "enabled": false } }
wad_plugin { "action": "uninstall", "id": "<pluginId>" }
```

## Gotchas

| Symptom | Cause |
|---|---|
| `E_SYNTAX` | any inline script has a syntax error; the whole file is checked |
| No `attach` in logs | mini-program not running, or the debug service is off |
| `[object Object]` in the panel | return a JSON string from the handler |
| Native hooks do nothing | `native.*` phases require a plugin; `wad_hooks` only covers net/logic |
| `wad.logic.call` rejects | the handler is registered in `wad-logic`, not in the panel script |
