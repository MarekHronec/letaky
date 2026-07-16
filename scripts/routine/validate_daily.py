#!/usr/bin/env python3
"""Deterministické business kontroly pre dennú routine.

Použitie:
    python scripts/routine/validate_daily.py data/latest.json
    python scripts/routine/validate_daily.py data/latest.json --strict

Skript nepoužíva externé balíky. JSON Schema validáciu treba spustiť navyše,
keď je v prostredí dostupný validátor draft 2020-12.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


STORE_PREFIX = re.compile(r"^(metro|kaufland|lidl|tesco|billa|coop|dm|teta)-", re.I)
WEEK = re.compile(r"^\d{4}-W\d{2}$")
EXPECTED_HOURS = {"metro", "kaufland", "lidl"}
FIRST_PARTY_HOSTS = {
    "metro": "metro.sk",
    "kaufland": "kaufland.sk",
    "lidl": "lidl.sk",
}
ROOT_REQUIRED = {
    "schema_version",
    "tyzden",
    "obdobie",
    "generovane",
    "promo",
    "top_ids",
    "obchody",
    "otvaracie_hodiny",
    "zdroje_stav",
}


def parse_day(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def valid_url(value: object) -> bool:
    try:
        parsed = urlparse(str(value))
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except ValueError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="data/latest.json")
    parser.add_argument("--strict", action="store_true", help="Povýši obsahové warningy na chyby.")
    args = parser.parse_args()

    path = Path(args.path)
    errors: list[str] = []
    warnings: list[str] = []

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: {path} sa nedá načítať ako JSON: {exc}")
        return 1

    missing_root = sorted(ROOT_REQUIRED - set(data))
    if missing_root:
        errors.append("Chýbajú root polia: " + ", ".join(missing_root))
    if data.get("schema_version") != 2:
        errors.append("schema_version musí byť 2")
    if not WEEK.fullmatch(str(data.get("tyzden", ""))):
        errors.append("tyzden nemá tvar YYYY-Www")
    try:
        datetime.fromisoformat(str(data.get("generovane", "")).replace("Z", "+00:00"))
    except ValueError:
        errors.append("generovane nie je platný ISO 8601 dátum s časom")

    offers: list[dict] = []
    offer_stores: dict[str, str] = {}
    store_counts: Counter[str] = Counter()
    for store in data.get("obchody") or []:
        store_id = str(store.get("id", "")).lower()
        rows = store.get("polozky") or []
        store_counts[store_id] += len(rows)
        if len(rows) < 20:
            warnings.append(f"{store_id}: iba {len(rows)} položiek; over kompletnosť letáku")
        for item in rows:
            if isinstance(item, dict):
                offers.append(item)
                offer_stores[str(item.get("id", ""))] = store_id

    ids = [str(item.get("id", "")) for item in offers]
    duplicate_ids = [key for key, count in Counter(ids).items() if key and count > 1]
    if duplicate_ids:
        errors.append(f"Duplicitné offer id: {len(duplicate_ids)}")
    if any(not key for key in ids):
        errors.append("Niektorá ponuka nemá id")

    product_ids = [str(item.get("product_id", "")) for item in offers]
    missing_product = sum(not value for value in product_ids)
    prefixed = sum(bool(STORE_PREFIX.match(value)) for value in product_ids)
    if missing_product:
        errors.append(f"Ponuky bez product_id: {missing_product}")
    if prefixed:
        errors.append(f"product_id s prefixom obchodu: {prefixed}/{len(product_ids)}")

    missing_category = sum(not item.get("kategoria") for item in offers)
    if missing_category:
        errors.append(f"Ponuky bez kategórie: {missing_category}")

    invalid_prices = 0
    bad_dates = 0
    missing_history = 0
    missing_metro_vat = 0
    weak_verdict_reason = 0
    expired_latest = 0
    history_2plus = 0
    today = date.today()

    for item in offers:
        price = item.get("cena")
        if not isinstance(price, (int, float)) or isinstance(price, bool) or price < 0:
            invalid_prices += 1
        start = parse_day(item.get("plati_od")) if item.get("plati_od") else None
        end = parse_day(item.get("plati_do")) if item.get("plati_do") else None
        if start and end and start > end:
            bad_dates += 1
        if end and end < today:
            expired_latest += 1
        history = item.get("historia_cien")
        if not isinstance(history, list):
            missing_history += 1
        elif len(history) >= 2:
            history_2plus += 1
        store_id = offer_stores.get(str(item.get("id", "")), "")
        if store_id == "metro" and item.get("cena_s_dph") is None:
            missing_metro_vat += 1
        if item.get("verdikt") in {"realna", "umela"}:
            reason = str(item.get("dovod_verdiktu") or "")
            if not re.search(r"\d", reason):
                weak_verdict_reason += 1

    if invalid_prices:
        errors.append(f"Neplatné ceny: {invalid_prices}")
    if bad_dates:
        errors.append(f"Ponuky s plati_od > plati_do: {bad_dates}")
    if missing_history:
        errors.append(f"Ponuky bez poľa historia_cien: {missing_history}")
    if missing_metro_vat:
        errors.append(f"Metro ponuky bez cena_s_dph: {missing_metro_vat}")
    if weak_verdict_reason:
        errors.append(f"Verdikt realna/umela bez číselného dôkazu: {weak_verdict_reason}")
    if expired_latest:
        errors.append(f"Latest obsahuje {expired_latest} expirovaných ponúk")

    top_ids = data.get("top_ids") or []
    if len(top_ids) != 10 or len(set(top_ids)) != 10:
        errors.append("top_ids musí obsahovať presne 10 unikátnych id")
    missing_top = sorted(set(top_ids) - set(ids))
    if missing_top:
        errors.append(f"top_ids odkazuje na {len(missing_top)} chýbajúcich ponúk")
    top_mix = Counter(offer_stores.get(str(key), "") for key in top_ids)
    represented = {store for store, count in top_mix.items() if store and count}
    if len(represented) < min(3, len(store_counts)):
        errors.append("top_ids nemá zástupcu zo všetkých troch hlavných obchodov")

    promos = data.get("promo") or []
    promo_ids = [str(item.get("id", "")) for item in promos if isinstance(item, dict)]
    if len(promo_ids) != len(set(promo_ids)):
        errors.append("Promo id nie sú unikátne")
    bad_promo = 0
    priority_one = 0
    for promo in promos:
        if not isinstance(promo, dict):
            bad_promo += 1
            continue
        priority = promo.get("priorita")
        if priority == 1:
            priority_one += 1
        if (
            not promo.get("id")
            or not promo.get("text")
            or priority not in {1, 2, 3}
            or not valid_url(promo.get("zdroj_url"))
            or not promo.get("plati_od")
            or not promo.get("plati_do")
        ):
            bad_promo += 1
    if bad_promo:
        errors.append(f"Promo bez povinného kontraktu: {bad_promo}")
    if promos and priority_one != 1:
        warnings.append(f"Promo priority 1: {priority_one}; očakáva sa presne jedna Top akcia")

    opening = data.get("otvaracie_hodiny") or {}
    stores = opening.get("predajne") or []
    opening_ids = {str(item.get("id", "")).lower() for item in stores if isinstance(item, dict)}
    if opening_ids != EXPECTED_HOURS:
        errors.append(
            "Otváracie hodiny musia mať presne Metro, Kaufland a Lidl; "
            f"nájdené: {sorted(opening_ids)}"
        )
    if not opening.get("poznamka_sviatky") or not valid_url(opening.get("zdroj_sviatky_url")):
        errors.append("Chýba explicitná sviatočná poznámka alebo oficiálny zdroj")
    for store in stores:
        store_id = str(store.get("id", "")).lower()
        source = str(store.get("zdroj_url", ""))
        host = urlparse(source).netloc.lower()
        expected = FIRST_PARTY_HOSTS.get(store_id)
        if not valid_url(source) or (expected and expected not in host):
            errors.append(f"{store_id}: zdroj hodín nie je first-party URL")
        verified = parse_day(store.get("overene"))
        if not verified:
            errors.append(f"{store_id}: chýba platný dátum overene")
        elif verified != today:
            warnings.append(f"{store_id}: hodiny nie sú overené dnes ({verified})")
        if not store.get("hodiny"):
            errors.append(f"{store_id}: chýbajú bežné hodiny")

    history_ratio = (history_2plus / len(offers) * 100) if offers else 0
    unverified = sum(item.get("verdikt") == "neoverene" for item in offers)
    unverified_ratio = (unverified / len(offers) * 100) if offers else 0
    if history_ratio < 10:
        warnings.append(f"Iba {history_ratio:.1f} % ponúk má aspoň 2 historické body")
    if unverified_ratio > 80:
        warnings.append(f"{unverified_ratio:.1f} % ponúk má verdikt neoverene")
    missing_images = sum(not item.get("obrazok_url") for item in offers)
    if missing_images:
        warnings.append(f"Ponuky bez obrázka: {missing_images}/{len(offers)}")

    if args.strict and warnings:
        errors.extend("STRICT: " + warning for warning in warnings)

    print(f"DATA: {path}")
    print(
        "SUMMARY: "
        f"offers={len(offers)} stores={dict(store_counts)} promos={len(promos)} "
        f"top={len(top_ids)} history_2plus={history_2plus}"
    )
    for warning in warnings:
        print("WARNING:", warning)
    for error in errors:
        print("ERROR:", error)

    if errors:
        print(f"RESULT: BLOCKED ({len(errors)} errors, {len(warnings)} warnings)")
        return 1
    print(f"RESULT: PASS ({len(warnings)} warnings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
