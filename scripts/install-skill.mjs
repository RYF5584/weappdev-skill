#!/usr/bin/env node
// WeAppDev skill installer.
//
//   npx -y weappdev-skill@latest init [--dir ~/.claude/skills]
//
// Copies skills/weappdev/ into a skills directory so Agent-Skills-compatible
// clients pick it up. Default targets, first existing wins:
//   ~/.zcode/skills  ~/.claude/skills  (or pass --dir)
// Also prints the MCP config snippet so the paired server is one step away.

import { parseArgs } from 'node:util';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The repository IS the skill — SKILL.md sits at the repo root.
// Only these entries belong inside the installed skill (no repo plumbing).
const SKILL_ENTRIES = ['SKILL.md', 'reference', 'examples', 'scripts'];
const SCRIPT_EXCLUDE = new Set(['validate-skill.mjs', 'install-skill.mjs']);
const SRC = root;

const { values } = parseArgs({
  options: { dir: { type: 'string' } },
  positionals: ['command'],
  allowPositionals: true,
});

if ((values.positionals?.[0] ?? 'init') !== 'init') {
  console.log('usage: npx weappdev-skill init [--dir <skills-dir>]');
  process.exit(2);
}

const candidates = values.dir
  ? [resolve(values.dir.replace(/^~(?=\/|$)/, homedir()))]
  : [join(homedir(), '.zcode', 'skills'), join(homedir(), '.claude', 'skills')];

const target = candidates.find((c) => existsSync(c)) ?? candidates[0];
if (!existsSync(target)) mkdirSync(target, { recursive: true });

const dest = join(target, 'weappdev');
if (existsSync(dest)) {
  console.log(`target already exists: ${dest} — remove it first or pass --dir`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const entry of SKILL_ENTRIES) {
  const srcEntry = join(SRC, entry);
  if (!existsSync(srcEntry)) continue;
  if (entry === 'scripts') {
    // repo plumbing (validate/install) stays out of the installed skill
    mkdirSync(join(dest, 'scripts'));
    for (const f of readdirSync(srcEntry)) {
      if (SCRIPT_EXCLUDE.has(f)) continue;
      cpSync(join(srcEntry, f), join(dest, 'scripts', f));
    }
  } else {
    cpSync(srcEntry, join(dest, entry), { recursive: true });
  }
}
const files = readdirSync(dest, { recursive: true }).length;

console.log(`installed ${files} entries -> ${dest}`);
console.log('');
console.log('Restart your AI client, then verify with: "use wad_status"');
console.log('');
console.log('Pair it with the MCP server (pick ONE):');
console.log('');
console.log('  phone-direct (no Node needed) — MCP config:');
console.log('  { "mcpServers": { "weappdev": { "url": "http://<phone-ip>:9400/mcp" } } }');
console.log('');
console.log('  Studio aggregator (Node 22+):');
console.log('  { "mcpServers": { "weappdev": { "command": "npx", "args": ["-y", "@ryf5584/weappdev-mcp"] } } }');
