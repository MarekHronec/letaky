#!/usr/bin/env python3
"""Audit/recovery nástroj dokončenej migrácie product_id.

Odstráni presne jeden známy prefix obchodu z product_id v latest a archívoch.
ID konkrétnej ponuky, ceny, história, top_ids a ostatné polia nemení.

V bežnom stave po migrácii vráti predvolený dry-run ``no_change``:
    python scripts/routine/migrate_product_ids.py

Zápis smie spustiť iba daily-finalizer v recovery režime, keď trvalý stav
ešte nie je ``complete``:
    python scripts/routine/migrate_product_ids.py --write --report .routine-work/runs/<id>/product-id-migration.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


PREFIX = re.compile(r"^(metro|kaufland|lidl|tesco|billa|coop|dm|teta)-", re.I)
BRAND_DISAMBIGUATION = {
    "metro-chef-": "brand-metro-chef-",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def targets() -> list[Path]:
    paths = [Path("data/latest.json")]
    paths.extend(sorted(Path("data/archive").glob("*.json")))
    return [path for path in paths if path.name != "index.json"]


def preservation_digest(value: object) -> str:
    """Hash every field except the product_id values allowed to migrate."""

    def scrub(node: object) -> object:
        if isinstance(node, dict):
            return {
                key: ("<MIGRATED_PRODUCT_ID>" if key == "product_id" else scrub(item))
                for key, item in node.items()
            }
        if isinstance(node, list):
            return [scrub(item) for item in node]
        return node

    payload = json.dumps(
        scrub(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def migrate(path: Path) -> tuple[dict, list[dict], list[str], dict]:
    raw = path.read_text(encoding="utf-8")
    original = json.loads(raw)
    data = json.loads(raw)
    aliases: list[dict] = []
    collisions: list[str] = []

    for store in data.get("obchody") or []:
        # Rovnaký pôvodný product_id sa môže legitímne objaviť vo viacerých
        # ponukách. Kolízia vzniká iba vtedy, keď sa dva rozdielne pôvodné ID
        # zmapujú na rovnaké cieľové ID (napr. už existuje prefixed aj čisté ID).
        sources_by_target: dict[str, set[str]] = defaultdict(set)
        rows = store.get("polozky") or []
        for item in rows:
            old = str(item.get("product_id") or "")
            new = PREFIX.sub("", old, count=1)
            for ambiguous_prefix, canonical_prefix in BRAND_DISAMBIGUATION.items():
                if new.lower().startswith(ambiguous_prefix):
                    new = canonical_prefix + new[len(ambiguous_prefix) :]
                    break
            if new:
                sources_by_target[new].add(old)
            if old and new != old:
                item["product_id"] = new
                aliases.append(
                    {
                        "file": path.as_posix(),
                        "store": store.get("id"),
                        "offer_id": item.get("id"),
                        "old_product_id": old,
                        "new_product_id": new,
                    }
                )
        for product_id, source_ids in sources_by_target.items():
            if len(source_ids) > 1:
                collisions.append(
                    f"{path.as_posix()}:{store.get('id')}:{product_id}:"
                    + ",".join(sorted(source_ids))
                )

    preservation_before = preservation_digest(original)
    preservation_after = preservation_digest(data)
    if preservation_before != preservation_after:
        collisions.append(f"{path.as_posix()}:preservation-digest-mismatch")

    file_report = {
        "file": path.as_posix(),
        "before_sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "preservation_sha256_before": preservation_before,
        "preservation_sha256_after": preservation_after,
        "aliases_count": len(aliases),
    }
    return data, aliases, collisions, file_report


def write_targeted(path: Path, aliases: list[dict]) -> str:
    """Replace only JSON product_id values and preserve every other byte."""

    raw = path.read_text(encoding="utf-8")
    mappings: dict[str, str] = {}
    expected: Counter[tuple[str, str]] = Counter()
    for alias in aliases:
        old = str(alias["old_product_id"])
        new = str(alias["new_product_id"])
        if old in mappings and mappings[old] != new:
            raise RuntimeError(f"Nejednoznačné mapovanie {old}")
        mappings[old] = new
        expected[(old, new)] += 1

    for (old, new), expected_count in expected.items():
        old_json = json.dumps(old, ensure_ascii=False)
        new_json = json.dumps(new, ensure_ascii=False)
        pattern = re.compile(r'("product_id"\s*:\s*)' + re.escape(old_json))
        raw, actual_count = pattern.subn(lambda match: match.group(1) + new_json, raw)
        if actual_count != expected_count:
            raise RuntimeError(
                f"{path}: očakávaných {expected_count} výskytov {old}, nahradených {actual_count}"
            )

    path.write_text(raw, encoding="utf-8")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report")
    args = parser.parse_args()

    all_aliases: list[dict] = []
    all_collisions: list[str] = []
    changed_files: list[str] = []
    migrated: list[tuple[Path, list[dict]]] = []
    file_reports: list[dict] = []

    for path in targets():
        _data, aliases, collisions, file_report = migrate(path)
        all_aliases.extend(aliases)
        all_collisions.extend(collisions)
        file_reports.append(file_report)
        if aliases:
            changed_files.append(path.as_posix())
            migrated.append((path, aliases))

    report = {
        "status": "blocked" if all_collisions else ("ready" if all_aliases else "no_change"),
        "write_requested": args.write,
        "changed_files": changed_files,
        "aliases_count": len(all_aliases),
        "aliases": all_aliases,
        "collisions": all_collisions,
        "files": file_reports,
        "preserved_fields": [
            "offer id",
            "prices",
            "historia_cien",
            "top_ids",
            "promo",
            "opening hours",
        ],
    }

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    if all_collisions:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    if args.write:
        for path, aliases in migrated:
            after_sha256 = write_targeted(path, aliases)
            for file_report in file_reports:
                if file_report["file"] == path.as_posix():
                    file_report["after_sha256"] = after_sha256
                    break
        report["status"] = "complete" if all_aliases else "no_change"

        if args.report:
            report_path.write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    print(
        json.dumps(
            {
                "status": report["status"],
                "write": args.write,
                "changed_files": len(changed_files),
                "aliases_count": len(all_aliases),
                "collisions": len(all_collisions),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
