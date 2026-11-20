#!/usr/bin/env node
// Pre-flight check for a WeAppDev session — Node 18+, stdlib only.
//
// Same checks as check_env.py / check-env.sh, for machines where Node is already
// installed (it is NOT required for phone-direct MCP or the REST API):
//   1. API server reachable (default http://127.0.0.1:9400, override with --host/--port)
//   2. phone identity (apiLevel / tools) via /v1/status
//   3. MCP endpoint answers tools/list
//
// Usage:  node check-env.mjs [--host 192.168.x.x] [--port 9400]
// Exit 0 = ready, 1 = problems (each line says what to do next).

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '9400' },
  },
});

const base = `http://${values.host}:${values.port}`;
const fail = [];

const say = (s = '') => console.log(s);
const ok = (s) => console.log('  ok    ' + s);
const bad = (s) => { fail.push(s); console.log('  FAIL  ' + s); };

async function getJson(path, timeoutMs = 5000) {
  const res = await fetch(base + path, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  return res.json();
}

say(`== API server (${base}) ==`);
let status = null;
try {
  status = await getJson('/v1/status');
  ok(`${base}  running=${status.running} pid=${status.process?.pid}`);
} catch (e) {
  bad(`${base} unreachable (${e.message}). LAN phone? -> --host <phone-ip>. USB only? -> adb forward tcp:${values.port} tcp:${values.port}`);
}

say('== phone identity ==');
if (status) {
  ok(`apiLevel=${status.mcp?.apiLevel} tools=${status.mcp?.toolsCount} version=${status.mcp?.version} profile=${status.profile?.id}`);
  if (!status.running) bad('server reports running=false — open the WeAppDev app on the phone');
} else {
  bad('skipped (no status)');
}

say('== MCP endpoint ==');
try {
  const res = await fetch(base + '/mcp', {
    method: 'POST',
    signal: AbortSignal.timeout(6000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const raw = await res.text();
  const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
  const payload = JSON.parse(dataLine ? dataLine.slice(5) : raw);
  const tools = payload.result?.tools ?? [];
  ok(`/mcp responds, ${tools.length} tools`);
} catch (e) {
  bad(`/mcp not usable (${e.message})`);
}

say();
if (fail.length) {
  say('NOT ready — fix the FAIL lines above.');
  process.exit(1);
}
say(`ready: point the MCP config at ${base}/mcp (or call REST on ${base}/v1/*).`);
