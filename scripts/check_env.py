#!/usr/bin/env python3
"""Pre-flight check for a WeAppDev session (Windows / Linux / macOS).

Pure standard library — no pip installs. Checks, in order:
  1. which MCP endpoint is reachable (phone LAN :9400, or adb-forwarded localhost:9400)
  2. the phone's identity (apiLevel / tool count) via /v1/status
  3. optional: adb presence + attached device + port forward (only if --adb)

Exit code 0 = ready; 1 = something failed; each line says what to do next.
Usage:  python3 check_env.py [--host 192.168.x.x] [--port 9400] [--adb [serial]]
"""
import argparse
import json
import subprocess
import sys
import urllib.request

PKG = "github.ryf5584.weappdev"
fail = 0


def say(s=""):
    print(s)


def ok(s):
    print("  ok    " + s)


def bad(s):
    global fail
    fail = 1
    print("  FAIL  " + s)


def http_get(url, timeout=4):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def adb(*args, timeout=10):
    return subprocess.run(["adb"] + list(args), capture_output=True, text=True, timeout=timeout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1",
                    help="phone/IP hosting the API server (default 127.0.0.1, i.e. adb-forwarded or on-device)")
    ap.add_argument("--port", type=int, default=9400)
    ap.add_argument("--adb", nargs="?", const="auto", default=None,
                    help="also check adb + attach + forward (only needed to CREATE the tunnel)")
    args = ap.parse_args()

    base = f"http://{args.host}:{args.port}"

    say("== API server ==")
    status = None
    try:
        status = http_get(base + "/v1/status")
        ok(f"{base}  running={status.get('running')} pid={status.get('process', {}).get('pid')}")
    except Exception as e:
        bad(f"{base} unreachable ({e}). If the phone is on LAN use --host <phone-ip>; "
            f"if USB, rerun with --adb to create the forward.")

    say("== phone identity ==")
    if status:
        mcp = status.get("mcp", {})
        ok(f"apiLevel={mcp.get('apiLevel')} tools={mcp.get('toolsCount')} "
           f"version={mcp.get('version')} profile={status.get('profile', {}).get('id')}")
        if not status.get("running"):
            bad("server reports running=false — open the WeAppDev app on the phone")
    else:
        bad("skipped (no status)")

    say("== MCP endpoint ==")
    try:
        payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode()
        req = urllib.request.Request(base + "/mcp", data=payload,
                                     headers={"Content-Type": "application/json",
                                              "Accept": "application/json, text/event-stream"})
        with urllib.request.urlopen(req, timeout=6) as r:
            raw = r.read().decode("utf-8", "replace")
        if "data:" in raw:
            raw = [l[5:] for l in raw.splitlines() if l.startswith("data:")][0]
        tools = json.loads(raw).get("result", {}).get("tools", [])
        ok(f"/mcp responds, {len(tools)} tools")
    except Exception as e:
        bad(f"/mcp not usable ({e})")

    if args.adb is not None:
        say("== adb ==")
        try:
            r = adb("version")
            if r.returncode != 0:
                raise RuntimeError("adb not working")
            ok("adb present")
            r = adb("devices")
            devs = [l for l in r.stdout.splitlines()[1:] if l.strip() and "device" in l]
            if not devs:
                bad("no device attached")
            else:
                serial = args.adb if args.adb != "auto" else devs[0].split()[0]
                ok(f"device: {serial}")
                if not (args.host != "127.0.0.1"):
                    r = adb("-s", serial, "forward", f"tcp:{args.port}", f"tcp:{args.port}")
                    ok("forward tcp:%d -> phone" % args.port) if r.returncode == 0 else bad("forward failed")
        except FileNotFoundError:
            bad("adb not on PATH (skip with no --adb; use --host <phone-ip> for LAN)")

    say()
    if fail:
        say("NOT ready — fix the FAIL lines above.")
    else:
        say("ready: point the MCP config at %s/mcp (or call REST on %s/v1/*)." % (base, base))
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
