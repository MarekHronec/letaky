#!/usr/bin/env python3
"""High-confidence secret scan for files that would be committed.

The browser-facing Supabase ``sb_publishable_`` key is intentionally not a
secret. Service-role keys, PATs, private keys, bearer/JWT credentials and
signed credential URLs are blocking.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github-token": re.compile(r"(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})"),
    "openai-key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "anthropic-key": re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"),
    "aws-access-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "supabase-secret": re.compile(r"\bsb_secret_[A-Za-z0-9_-]{16,}\b"),
    "jwt-credential": re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b"),
}
SENSITIVE_QUERY = {
    "access_token", "api_key", "apikey", "client_secret", "credential",
    "password", "secret", "sig", "signature", "token",
    "x_amz_credential", "x_amz_security_token", "x_amz_signature",
    "x_goog_credential", "x_goog_signature",
}
URL = re.compile(r"https?://[^\s\"'<>]+")
BLOCKED_NAMES = re.compile(r"(?:^|/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$", re.I)
BLOCKED_SUFFIXES = {".p12", ".pfx", ".pem", ".key"}


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        capture_output=True,
        check=True,
    )
    return [Path(part.decode("utf-8")) for part in result.stdout.split(b"\0") if part]


def sensitive_url(url: str) -> bool:
    try:
        for key, _value in parse_qsl(urlparse(url).query, keep_blank_values=True):
            normalized = key.lower().replace("-", "_")
            if normalized in SENSITIVE_QUERY:
                return True
            if normalized.startswith(("x_amz_", "x_goog_")) and any(
                marker in normalized for marker in ("credential", "signature", "token")
            ):
                return True
    except ValueError:
        return False
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", help="Default: všetky Git tracked súbory.")
    args = parser.parse_args()
    files = [Path(item) for item in args.paths] if args.paths else tracked_files()
    findings: list[str] = []

    for path in files:
        normalized = path.as_posix()
        if BLOCKED_NAMES.search(normalized) or path.suffix.lower() in BLOCKED_SUFFIXES:
            findings.append(f"blocked-file:{normalized}")
            continue
        if not path.is_file() or path.stat().st_size > 20_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for name, pattern in PATTERNS.items():
            if pattern.search(text):
                findings.append(f"{name}:{normalized}")
        for match in URL.finditer(text):
            if sensitive_url(match.group(0).rstrip(".,);]")):
                findings.append(f"signed-url:{normalized}")
                break

    for finding in sorted(set(findings)):
        print("SECRET:", finding)
    if findings:
        print(f"RESULT: BLOCKED ({len(set(findings))} high-confidence findings)")
        return 1
    print(f"RESULT: PASS ({len(files)} files, no high-confidence secrets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
