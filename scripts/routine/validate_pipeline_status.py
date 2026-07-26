#!/usr/bin/env python3
"""Validate the small public health contract emitted by the private pipeline."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

OUTCOMES = {"PASS", "NO_CHANGE", "DEGRADED", "BLOCKED"}
STORES = {"kaufland", "lidl", "metro"}
SAFE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,100}$")
BAD_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\u202a-\u202e\u2066-\u2069]|<\s*[A-Za-z!/]")


def _nonnegative_map(value, keys, label, errors):
    if not isinstance(value, dict) or set(value) != set(keys):
        errors.append(f"{label} musí mať presne kľúče {sorted(keys)}")
        return {}
    for key, item in value.items():
        if type(item) is not int or not 0 <= item <= 30_000:
            errors.append(f"{label}.{key} musí byť celé číslo 0..30000")
    return value


def validate(value):
    errors = []
    required = {
        "generovane", "run_id", "outcome", "counts", "fresh", "carry_forward",
        "validation_ok", "anomalies", "needs_review_items",
    }
    optional = {"publish_eligible", "freshness", "warnings"}
    if not isinstance(value, dict):
        return ["root musí byť JSON objekt"]
    extra = set(value) - required - optional
    missing = required - set(value)
    if missing:
        errors.append("chýbajú polia: " + ", ".join(sorted(missing)))
    if extra:
        errors.append("neznáme polia: " + ", ".join(sorted(extra)))

    try:
        stamp = datetime.fromisoformat(str(value.get("generovane", "")).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            errors.append("generovane musí obsahovať časovú zónu")
    except ValueError:
        errors.append("generovane nie je platný ISO 8601 timestamp")
    if not SAFE_ID.fullmatch(str(value.get("run_id") or "")):
        errors.append("run_id má neplatný formát")
    if value.get("outcome") not in OUTCOMES:
        errors.append("outcome má neznámu hodnotu")
    if type(value.get("validation_ok")) is not bool:
        errors.append("validation_ok musí byť boolean")

    counts = _nonnegative_map(value.get("counts"), STORES, "counts", errors)
    fresh = _nonnegative_map(value.get("fresh"), STORES, "fresh", errors)
    carry = _nonnegative_map(value.get("carry_forward"), {"lidl", "metro"}, "carry_forward", errors)
    for store in STORES:
        expected = fresh.get(store, 0) + carry.get(store, 0)
        if store in counts and counts[store] != expected:
            errors.append(f"{store}: counts sa nerovná fresh + carry_forward")

    for field in ("anomalies", "warnings"):
        items = value.get(field, [])
        if not isinstance(items, list) or len(items) > 100:
            errors.append(f"{field} musí byť pole s najviac 100 položkami")
            continue
        if any(not isinstance(item, str) or len(item) > 500 or BAD_TEXT.search(item) for item in items):
            errors.append(f"{field} obsahuje nebezpečný alebo príliš dlhý text")
    pending = value.get("needs_review_items")
    if type(pending) is not int or not 0 <= pending <= 100_000:
        errors.append("needs_review_items musí byť celé číslo 0..100000")
    if "publish_eligible" in value and type(value["publish_eligible"]) is not bool:
        errors.append("publish_eligible musí byť boolean")
    if value.get("outcome") == "BLOCKED" and value.get("publish_eligible") is True:
        errors.append("BLOCKED nesmie byť publish_eligible")
    return errors


def main():
    path = Path(sys.argv[1] if len(sys.argv) == 2 else "data/pipeline-status.json")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: {path}: {exc}")
        return 1
    errors = validate(value)
    if errors:
        for error in errors:
            print("ERROR:", error)
        return 1
    print(f"PASS: {path} public pipeline status")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
