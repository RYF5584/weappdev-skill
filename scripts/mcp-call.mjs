#!/usr/bin/env node
// Call one MCP tool from the shell.
//
// Useful for reproducing a failure outside the client, for one-off checks, and for
// scripting sequences that do not need an AI in the loop.
//
// Two modes, auto-detected:
//   * aggregator (default) — spawns `weappdev-mcp` over stdio
//   * direct phone         — pass --url http://127.0.0.1:<port>/mcp
//
// Examples:
//   ./mcp-call.mjs wad_devices
//   ./mcp-call.mjs wad_status --device 0017f447
//   ./mcp-call.mjs wad_take_snapshot '{"layer":"render","maxNodes":5}' --device 0017f447
//   ./mcp-call.mjs wad_status --url http://127.0.0.1:9400/mcp
//   ./mcp-call.mjs --tools                      # list tool names
//
// Exit code is 0 on success, 1 on a tool error, 2 on a usage/transport problem.

import { spawn } from 'node:child_process';

function usage(code = 0) {
  process.stderr.write(`usage: mcp-call.mjs [--url URL] [--device ALIAS] [--timeout MS] <tool> [json-args]
       mcp-call.mjs --tools [--device ALIAS]

  --url      talk to a phone directly instead of spawning the aggregator
  --device   pin a device (aggregator mode); also accepted per call
  --timeout  overall timeout in ms (default 90000)
  --tools    print "name — first sentence of description" for every tool
`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const opts = { url: '', device: '', timeout: 90_000, tools: false };
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--url') opts.url = argv[++i] || '';
  else if (a === '--device') opts.device = argv[++i] || '';
  else if (a === '--timeout') opts.timeout = Number(argv[++i] || 90_000);
  else if (a === '--tools') opts.tools = true;
  else if (a === '-h' || a === '--help') usage(0);
  else rest.push(a);
}

const tool = rest[0] || '';
let args = {};
if (rest[1]) {
  try {
    args = JSON.parse(rest[1]);
  } catch (e) {
    process.stderr.write(`invalid JSON args: ${e.message}\n`);
    usage(2);
  }
}
if (opts.device) args.device = opts.device;

// ── transport: direct HTTP ──────────────────────────────────
async function viaHttp(url) {
  const post = async (body, sid) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sid ? { 'Mcp-Session-Id': sid } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { res, json };
  };

  const init = await post({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'skill-script', version: '1' } },
  });
  if (!init.json) throw new Error(`initialize returned non-JSON (HTTP ${init.res.status})`);
  const sid = init.res.headers.get('mcp-session-id') || '';

  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid).catch(() => {});

  if (opts.tools) {
    const tl = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sid);
    return { kind: 'tools', tools: (tl.json?.result?.tools) || [] };
  }

  const call = await post({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args },
  }, sid);
  return { kind: 'call', resp: call.json, status: call.res.status };
}

// ── transport: aggregator over stdio ───────────────────────
function viaStdio() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', 'weappdev-mcp'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
    });
    let buf = '';
    const pending = new Map();
    let nextId = 1;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout after ${opts.timeout}ms`));
    }, opts.timeout);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const resolveFn = pending.get(msg.id);
        if (resolveFn) {
          pending.delete(msg.id);
          resolveFn(msg);
        }
      }
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });

    const rpc = (method, params) => new Promise((resolveMsg) => {
      const id = nextId++;
      pending.set(id, resolveMsg);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

    (async () => {
      try {
        await rpc('initialize', {
          protocolVersion: '2025-06-18', capabilities: {},
          clientInfo: { name: 'skill-script', version: '1' },
        });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        if (opts.tools) {
          const tl = await rpc('tools/list', {});
          clearTimeout(timer);
          child.stdin.end();
          resolve({ kind: 'tools', tools: tl.result?.tools || [] });
          return;
        }
        const resp = await rpc('tools/call', { name: tool, arguments: args });
        clearTimeout(timer);
        child.stdin.end();
        resolve({ kind: 'call', resp });
      } catch (e) {
        clearTimeout(timer);
        child.kill();
        reject(e);
      }
    })();
  });
}

// ── main ───────────────────────────────────────────────────
if (!opts.tools && !tool) usage(2);

try {
  const out = opts.url ? await viaHttp(opts.url) : await viaStdio();

  if (out.kind === 'tools') {
    for (const t of out.tools) {
      const first = String(t.description || '').split('. ')[0];
      process.stdout.write(`${t.name} — ${first}\n`);
    }
    process.exit(0);
  }

  if (!out.resp) {
    process.stderr.write(`no JSON-RPC response (HTTP ${out.status})\n`);
    process.exit(2);
  }
  if (out.resp.error) {
    process.stderr.write(`JSON-RPC error: ${JSON.stringify(out.resp.error)}\n`);
    process.exit(1);
  }

  const result = out.resp.result || {};
  const structured = result.structuredContent
    ?? (result.content?.find((c) => c.type === 'text')?.text ?? '');
  process.stdout.write(`${JSON.stringify(structured, null, 2)}\n`);
  process.exit(result.isError ? 1 : 0);
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(2);
}
