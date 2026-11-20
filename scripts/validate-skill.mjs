#!/usr/bin/env node
// Validate the skill against the Agent Skills spec and the repository's own rules.
//
// Checks:
//   * SKILL.md starts with `---` and has parseable YAML frontmatter
//   * only allowed frontmatter keys (extra keys are a hard error when uploading)
//   * `description` (+ `when_to_use`) <= 1536 chars, `compatibility` <= 500
//   * name has no forbidden characters
//   * SKILL.md body < 500 lines (guidance, enforced as a warning-free limit)
//   * every relative link in the docs resolves
//   * the docs are English-only (no CJK), which this repository requires
//
// Run: node scripts/validate-skill.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// The repository IS the skill: SKILL.md sits at the repo root.
const SKILL_DIR = ROOT;
const SKILL_MD = join(SKILL_DIR, 'SKILL.md');

const ALLOWED_KEYS = new Set([
  'name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools',
  // Accepted by some hosts but not required; still allowed by the spec subset we target.
  'when_to_use',
]);
const MAX_DESC = 1536;
const MAX_COMPAT = 500;
const MAX_BODY_LINES = 500;

const problems = [];
const warns = [];
const fail = (m) => problems.push(m);

// ── frontmatter ──────────────────────────────────────────────

const raw = readFileSync(SKILL_MD, 'utf8');
if (!raw.startsWith('---')) {
  fail('SKILL.md must start with `---` (frontmatter must be the first line)');
}
// The opening delimiter must be its OWN line (`---\n`). A missing newline
// (`---name: …`) makes strict loaders treat the whole file as plain text and
// show raw frontmatter as the description.
if (!raw.startsWith('---\n')) {
  fail('SKILL.md: line 1 must be exactly `---` (a newline must follow it)');
}
if (raw.includes('\r\n')) {
  fail('SKILL.md uses CRLF line endings; use LF');
}
const end = raw.indexOf('\n---', 3);
if (end < 0) fail('SKILL.md frontmatter is not terminated by a `---` line');

const fmText = raw.slice(3, end).trim();
const body = raw.slice(end + 4);

/** Minimal YAML reader for the flat key/value + one-level map shapes we use. */
function parseFrontmatter(text) {
  const out = {};
  let currentMap = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m && !line.startsWith(' ')) {
      const [, key, value] = m;
      if (value === '') {
        out[key] = {};
        currentMap = key;
      } else {
        out[key] = value.replace(/^["']|["']$/g, '');
        currentMap = null;
      }
      continue;
    }
    const nested = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nested && currentMap) {
      out[currentMap][nested[1]] = nested[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const fm = parseFrontmatter(fmText);

for (const k of Object.keys(fm)) {
  if (!ALLOWED_KEYS.has(k)) {
    fail(`frontmatter key not allowed by the spec: "${k}" `
      + `(allowed: ${[...ALLOWED_KEYS].join(', ')})`);
  }
}

// Strict-YAML guard: our minimal parser tolerates unquoted colons, but real
// loaders (strict YAML) reject them as nested compact mappings. Values containing
// ': ' MUST be quoted in the frontmatter.
for (const line of fmText.split('\n')) {
  const m = /^([A-Za-z0-9_-]+):\s(.*)$/.exec(line);
  if (!m) continue;
  const [, key, value] = m;
  if (value.includes(': ') && !value.startsWith('"') && !value.startsWith("'")) {
    fail(`frontmatter "${key}" contains ': ' but is not quoted - strict YAML parsers `
      + 'reject this as a nested mapping. Wrap the value in double quotes.');
  }
}

const name = fm.name || '';
if (!name) fail('frontmatter `name` is required');
if (/[<>\u200b-\u200f\u202a-\u202e]/.test(name)) fail('`name` contains forbidden characters');
if (name && name !== 'weappdev') {
  warns.push(`name "${name}" differs from the directory name "weappdev"`);
}

const desc = String(fm.description || '');
if (!desc) fail('frontmatter `description` is required');
const descLen = desc.length + String(fm.when_to_use || '').length;
if (descLen > MAX_DESC) fail(`description is ${descLen} chars; the limit is ${MAX_DESC}`);

if (fm.compatibility && String(fm.compatibility).length > MAX_COMPAT) {
  fail(`compatibility is ${String(fm.compatibility).length} chars; the limit is ${MAX_COMPAT}`);
}
if (fm.metadata && typeof fm.metadata !== 'object') {
  fail('`metadata` must be a mapping');
}

const bodyLines = body.split('\n').length;
if (bodyLines > MAX_BODY_LINES) {
  fail(`SKILL.md body is ${bodyLines} lines; keep it under ${MAX_BODY_LINES}`);
}

// ── file inventory + links + language ───────────────────────

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(SKILL_DIR);
const mdFiles = files.filter((f) => f.endsWith('.md'));
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

let linkCount = 0;

/** Split markdown into segments; returns prose parts with fenced code blocks removed.
 *  Verbatim data (capture labels, response bodies, upstream error strings) legitimately
 *  contains CJK inside fenced blocks; prose outside them must stay English-only. */
function stripFences(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; out.push(''); continue; }
    out.push(inFence ? '' : line);
  }
  return out.join('\n');
}

for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  const cjk = stripFences(text).match(CJK);
  if (cjk) {
    const line = stripFences(text).slice(0, cjk.index).split('\n').length;
    fail(`${rel}:${line} contains CJK characters outside a fenced code block; `
      + 'prose is English-only (verbatim data belongs in code blocks)');
  }

  // Markdown links to local files must resolve.
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = m[1].split('#')[0].trim();
    if (!target || /^https?:|^mailto:|^#/.test(target)) continue;
    linkCount++;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      fail(`${rel}: broken link -> ${target}`);
    }
  }
}

// ── scripts must be present and parseable ───────────────────

for (const script of ['scripts/check-env.sh', 'scripts/mcp-call.mjs']) {
  if (!existsSync(join(SKILL_DIR, script))) fail(`missing referenced script: ${script}`);
}

// ── report ──────────────────────────────────────────────────

console.log(`skill: ${name || '(unnamed)'}`);
console.log(`files: ${files.length} (${mdFiles.length} markdown, ${linkCount} local links)`);
console.log(`description: ${descLen}/${MAX_DESC} chars · body: ${bodyLines}/${MAX_BODY_LINES} lines`);

if (warns.length) {
  console.log('\nwarnings:');
  for (const w of warns) console.log(`  - ${w}`);
}

if (problems.length) {
  console.error('\nvalidation failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nskill validation passed');
