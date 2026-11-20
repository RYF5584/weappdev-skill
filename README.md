# weappdev-skill

An [Agent Skill](https://code.claude.com/docs/en/skills) for **WeAppDev** — the Android app that runs
WeChat mini-programs outside WeChat and exposes a full debugger through MCP.

The skill teaches an AI assistant how to drive the `weappdev-mcp` server: capture network, cloud and
native traffic, reverse signing algorithms, set breakpoints, intercept WebSocket frames, automate the
UI, and build plugins.

## Install

**The repository IS the skill** — `SKILL.md` sits at the repo root, so any of these works:

### One command (npx)

```bash
npx -y @ryf5584/weappdev-skill@latest init            # installs into ~/.zcode/skills or ~/.claude/skills
npx -y @ryf5584/weappdev-skill@latest init --dir .claude/skills   # project-local instead
```

### Download ZIP (no git, no Node)

Download the repo ZIP from GitHub, extract it, rename the folder to `weappdev`, and drop it into
your client's skills directory (`~/.zcode/skills/`, `~/.claude/skills/`, …). The extracted folder
already has `SKILL.md` at its root — nothing else to move around.

### From git

```bash
git clone https://github.com/RYF5584/weappdev-skill.git
mkdir -p ~/.claude/skills
cp -r weappdev-skill ~/.claude/skills/weappdev    # note: the clone IS the skill folder
```

Most hosts also accept a symlink to the same folder.

## Prerequisite: the MCP server

The skill assumes the MCP server is configured. Add it to your client **once**:

```json
{
  "mcpServers": {
    "weappdev": {
      "command": "npx",
      "args": ["-y", "weappdev-mcp"]
    }
  }
}
```

That package is [weappdev-mcp](https://github.com/RYF5584/weappdev-mcp) (npm: `@ryf5584/weappdev-mcp`). It
aggregates one or many phones. If you instead point your client straight at a phone
(`http://<phone>:9400/mcp`), the skill still applies — see `reference/connection.md`, which explains the
two modes and what changes.

You also need the WeAppDev app running on the phone, Node.js 22+, and `adb` for USB setups.

## What is inside

```
skills/weappdev/
├── SKILL.md                     entry point + routing table
├── reference/
│   ├── connection.md            direct phone vs aggregator; device selection; MCP-vs-REST pitfalls; "no device"
│   ├── reverse-engineering.md   capture → initiator → source → breakpoint → paused state → replay
│   ├── network-capture.md       HTTP records, replay, rewriting, hooks
│   ├── cloud-capture.md         cloud-development calls, keys, build/decode
│   ├── pure-protocol.md         NEW: /v1/ilink plane — js-login code, user-encrypt-key, plugin
│   │                            HostSign, gateway/container credentials, any tcbapi_* via jsop;
│   │                            measured request templates; -12030/-12028/61010/-103006 semantics
│   ├── native-capture.md        JSAPI envelope layer, credentials, live modification
│   ├── websocket.md             frames, send/recv, block/rewrite
│   ├── automation.md            snapshot/click/fill/screenshot/wait, batches
│   ├── plugins.md               plugin format, API surface, full dev loop (write/install/debug/update)
│   ├── tools.md                 all 64 tools with arguments
│   └── troubleshooting.md       error codes and symptom-first diagnosis
├── examples/                    copy-paste call sequences per scenario
│   └── cloud-dev-protocol.md    gateway/container/function purely by protocol (channel decision
│                                V3 HTTP vs native jsop), measured templates
└── scripts/                     same job, one per interpreter — never install a runtime for these
    ├── check_env.py             pre-flight environment check (Windows / Linux / macOS)
    ├── check-env.sh             pre-flight environment check (POSIX shell)
    ├── check-env.mjs            pre-flight environment check (Node 18+, optional)
    ├── mcp_call.py              call any MCP tool from the shell (stdlib only)
    └── mcp-call.mjs             call any MCP tool from the shell (Node 18+)
```

`SKILL.md` is short on purpose: it routes to one reference file, so the assistant loads only what the
task needs.

## Validate

```bash
node scripts/validate-skill.mjs
```

Checks the frontmatter against the Agent Skills spec (allowed keys, description and compatibility
lengths, `---` on line 1), resolves every relative link, enforces the English-only rule, and keeps the
entry file under 500 lines. CI runs it on every push.

## Languages

English only, by design: the skill is consumed by assistants, and mixed-language reference material
made routing and search less reliable.

## License

MIT
