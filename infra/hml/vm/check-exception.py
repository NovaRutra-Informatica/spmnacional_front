#!/usr/bin/env python3
"""Exercise the production exception validator with synthetic dates and Linux files.

Run as root inside an isolated Linux container; no cloud or host service calls.
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


common = Path(__file__).with_name("common.sh").read_text(encoding="utf-8")
code = common.split("<<'PY_ACCESS_EXCEPTION'\n", 1)[1].split("\nPY_ACCESS_EXCEPTION", 1)[0]
scope = {"__name__": "exception_test"}
exec(compile(code, "common.sh:access-exception", "exec"), scope)
checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


deadline = 1791018000
midnight_brt = 1790910000
start = deadline - 36000  # Approved Oct 2 at 20h BRT, closed by the normal gate.
valid = {
    "approved_date": "2026-10-02",
    "timezone": "America/Sao_Paulo",
    "start": start,
    "expires": deadline,
}
is_current = scope["exception_is_current"]
for now, expected, reason in [
    (start - 1, False, "Must remain closed before the approved start"),
    (start, True, "Start must be inclusive"),
    (deadline - 21601, True, "Approved Oct 2 at 23:59:59 BRT remains open"),
    (deadline - 21600, True, "Approved overnight access crosses midnight into Oct 3"),
    (deadline - 1, True, "Oct 3 at 05:59:59 BRT must still be allowed"),
    (deadline, False, "Oct 3 at 06:00:00 BRT must be closed"),
    (deadline + 1, False, "Must remain closed after 06h"),
    (deadline + 10800, False, "Regular Saturday 09h cannot inherit this exception"),
    (deadline + 86400, False, "The following day cannot inherit an exception"),
]:
    check(is_current(valid, now) is expected, reason)

mutations = [
    ("approved_date", "2026-10-03", "An exception cannot claim a different approved date"),
    ("approved_date", "2026-10-01", "Yesterday's authorization cannot be replayed"),
    ("timezone", "UTC", "The approved timezone is fixed"),
    ("timezone", "America/New_York", "A different named timezone is invalid"),
    ("start", deadline, "Start must precede expiration"),
    ("start", 0, "Zero timestamp is invalid"),
    ("start", midnight_brt - 1, "Start must fall on the approved date in BRT"),
    ("start", deadline - 86401, "Duration cannot exceed 24 hours"),
    ("start", True, "Boolean timestamps are invalid"),
    ("start", str(start), "String timestamps are invalid"),
    ("start", float(start), "Fractional timestamps are invalid"),
    ("expires", deadline + 1, "No value can extend the fixed 06h cutoff"),
    ("expires", start, "Zero-length authorization is invalid"),
    ("expires", False, "Boolean expiration is invalid"),
    ("expires", str(deadline), "String expiration is invalid"),
]
for key, value, reason in mutations:
    candidate = copy.deepcopy(valid)
    candidate[key] = value
    check(not is_current(candidate, start), reason)
for candidate in [None, [], True, "text", {}, {**valid, "bypass": True}]:
    check(not is_current(candidate, start), "Wrong schema cannot authorize access")
for field in valid:
    candidate = copy.deepcopy(valid)
    del candidate[field]
    check(not is_current(candidate, start), "Missing field cannot authorize access")
candidate = {**valid, "start": midnight_brt, "expires": start + 10}
check(is_current(candidate, start + 9), "A shorter approval within today is valid")
check(not is_current(candidate, start + 10), "Shorter approval still expires exclusively")

check(os.geteuid() == 0, "Filesystem checks require root inside an isolated Linux fixture")


def protected_is_current(filename):
    try:
        return scope["protected_exception_is_current"](str(filename), start)
    except Exception:
        return False


with tempfile.TemporaryDirectory(prefix="spm-hml-exception-check-") as temporary:
    root = Path(temporary)
    filename = root / "access-exception.json"
    filename.write_text(json.dumps(valid), encoding="utf-8")
    filename.chmod(0o600)
    check(protected_is_current(filename), "A root-owned 0600 regular file is valid")
    for mode in [0o644, 0o640, 0o660, 0o400, 0o700]:
        filename.chmod(mode)
        check(not protected_is_current(filename), "Only mode 0600 is accepted")
    filename.chmod(0o600)
    os.chown(filename, 1000, 1000)
    check(not protected_is_current(filename), "A non-root owner is rejected")
    os.chown(filename, 0, 0)
    symlink = root / "symlink.json"
    symlink.symlink_to(filename)
    check(not protected_is_current(symlink), "Symlinks must not be followed")
    hardlink = root / "hardlink.json"
    os.link(filename, hardlink)
    check(not protected_is_current(hardlink), "Hard-linked files are rejected")
    hardlink.unlink()
    check(not protected_is_current(root), "Directories are rejected")
    fifo = root / "fifo.json"
    os.mkfifo(fifo, 0o600)
    check(not protected_is_current(fifo), "A FIFO is rejected without waiting for a writer")
    for payload in [
        b"", b"{broken", b"\xff", b"x" * 4097,
        json.dumps(valid).encode()[:-1] + b',"expires":1791018000}',
    ]:
        filename.write_bytes(payload)
        check(not protected_is_current(filename), "Malformed, duplicate or oversized JSON is rejected")
        # The actual production entry point must fail closed without printing data.
        program = code.replace("time.time()", str(start))
        result = subprocess.run([sys.executable, "-c", program, str(filename)],
                                capture_output=True, timeout=5, check=False)
        check(result.returncode == 1 and not result.stdout and not result.stderr,
              "Production entry point must reject silently and return failure")
    filename.write_text(json.dumps(valid), encoding="utf-8")
    program = code.replace("time.time()", str(deadline))
    result = subprocess.run([sys.executable, "-c", program, str(filename)],
                            capture_output=True, timeout=5, check=False)
    check(result.returncode == 1 and not result.stdout and not result.stderr,
          "Production entry point must close at exactly 06h BRT")
    filename.unlink()
    check(not protected_is_current(filename), "A missing approval remains closed")

print(f"Temporary HML exception: {checks} checks passed, including midnight, 06h BRT and the following day.")
