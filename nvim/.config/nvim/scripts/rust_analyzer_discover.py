#!/usr/bin/env python3

import json
import os
from pathlib import Path
import subprocess
import sys


FALLBACK_TITLE = "Discover workspace"
TRACE_ENV = "NVIM_RA_DISCOVER_TRACE"


def normalize_arg(raw_arg: str) -> str:
    try:
        payload = json.loads(raw_arg)
    except json.JSONDecodeError:
        return raw_arg

    if not isinstance(payload, dict):
        return raw_arg

    changed = False
    cwd = Path.cwd()

    for key in ("path", "buildfile"):
        value = payload.get(key)
        if isinstance(value, str) and value and not Path(value).is_absolute():
            payload[key] = str((cwd / value).resolve())
            changed = True

    if not changed:
        return raw_arg

    return json.dumps(payload, separators=(",", ":"))


def trace(*parts: object) -> None:
    path = os.environ.get(TRACE_ENV)
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(" ".join(str(part) for part in parts) + "\n")


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: rust_analyzer_discover.py <command> [args...]", file=sys.stderr)
        return 2

    command = [normalize_arg(arg) for arg in sys.argv[1:]]
    trace("cwd=", Path.cwd())
    trace("argv=", json.dumps(sys.argv[1:]))
    trace("normalized=", json.dumps(command))

    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=sys.stderr,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        print(f"failed to start discover command: {exc}", file=sys.stderr)
        return 127

    assert proc.stdout is not None

    for raw_line in proc.stdout:
        line = raw_line.rstrip("\n")
        output = line

        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(payload, dict):
                title = payload.get("title")
                if not isinstance(title, str) or not title.strip():
                    payload["title"] = FALLBACK_TITLE
                    output = json.dumps(payload, separators=(",", ":"))

        sys.stdout.write(output + "\n")
        sys.stdout.flush()

    return proc.wait()


if __name__ == "__main__":
    raise SystemExit(main())
