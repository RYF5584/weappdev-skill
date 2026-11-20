#!/usr/bin/env python3
"""Call any WeAppDev MCP tool from the shell — Python 3, stdlib only (no Node needed).

Usage:
  python3 mcp_call.py <tool> ['{"json":"args"}'] [--base http://127.0.0.1:9400]
  python3 mcp_call.py wad_status
  python3 mcp_call.py wad_ilink '{"action":"js-login","appid":"wx…"}'
  python3 mcp_call.py wad_open_app '{"appid":"wx…"}'

Prints the structured result as JSON; exit 0 when the tool answered ok, 1 otherwise.
The same call works against any phone running the API server — point --base at it
(this is how on-device Android AI agents without Node use the MCP).
"""
import argparse
import json
import sys
import urllib.request


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tool")
    ap.add_argument("args", nargs="?", default="{}")
    ap.add_argument("--base", default="http://127.0.0.1:9400")
    a = ap.parse_args()

    try:
        arguments = json.loads(a.args)
    except json.JSONDecodeError as e:
        print("arguments must be a JSON object: %s" % e, file=sys.stderr)
        return 2

    payload = json.dumps({"jsonrpc": "2.0", "id": 1,
                          "method": "tools/call",
                          "params": {"name": a.tool, "arguments": arguments}}).encode()
    req = urllib.request.Request(
        a.base + "/mcp", data=payload,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", "replace")
    except Exception as e:
        print(json.dumps({"ok": False, "error": "http", "message": str(e)}))
        return 1

    if "data:" in raw:  # SSE framing
        lines = [l[5:] for l in raw.splitlines() if l.startswith("data:")]
        raw = lines[0] if lines else raw
    try:
        resp = json.loads(raw)
    except json.JSONDecodeError:
        print(raw[:2000])
        return 1

    result = resp.get("result") or {}
    sc = result.get("structuredContent")
    if sc is None:
        for c in result.get("content") or []:
            if c.get("type") == "text":
                try:
                    sc = json.loads(c["text"])
                except Exception:
                    sc = {"text": c["text"]}
                break
    if sc is None and result.get("isError"):
        sc = {"ok": False, "error": "tool_error"}
    print(json.dumps(sc if sc is not None else resp, ensure_ascii=False, indent=1))
    ok_flag = isinstance(sc, dict) and sc.get("ok", True) and not result.get("isError")
    return 0 if ok_flag else 1


if __name__ == "__main__":
    sys.exit(main())
