#!/usr/bin/env python3
"""Bezpečná prvá fáza migrácie product_id.

Odstráni presne jeden známy prefix obchodu z product_id v latest a archívoch.
ID konkrétnej ponuky, ceny, história, top_ids a ostatné polia nemení.

Predvolene je dry-run:
    python scripts/routine/migrate_product_ids.py

Zápis smie spustiť iba daily-finalizer:
    python scripts/routine/migrate_product_ids.py --write --report .routine-work/runs/<id>/product-id-migration.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
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


def migrate(path: Path) -> tuple[dict, list[dict], list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
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

    return data, aliases, collisions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report")
    args = parser.parse_args()

    all_aliases: list[dict] = []
    all_collisions: list[str] = []
    changed_files: list[str] = []
    migrated: list[tuple[Path, dict]] = []

    for path in targets():
        data, aliases, collisions = migrate(path)
        all_aliases.extend(aliases)
        all_collisions.extend(collisions)
        if aliases:
            changed_files.append(path.as_posix())
            migrated.append((path, data))

    report = {
        "status": "blocked" if all_collisions else ("ready" if all_aliases else "no_change"),
        "write_requested": args.write,
        "changed_files": changed_files,
        "aliases_count": len(all_aliases),
        "aliases": all_aliases,
        "collisions": all_collisions,
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
        for path, data in migrated:
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
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
