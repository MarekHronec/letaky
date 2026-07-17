#!/usr/bin/env python3
"""Deterministická publish brána pre dennú routine.

Skript nepoužíva externé balíky. Kontroluje business kontrakt, platnosť
zdedenú z obchodu, TOP/promo, prevádzkové údaje, stav migrácie a voliteľne
aj zachovanie histórie oproti predchádzajúcemu datasetu.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl, urlparse
from zoneinfo import ZoneInfo

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
SENSITIVE_QUERY_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "bearer",
    "client_secret",
    "credential",
    "password",
    "secret",
    "sig",
    "signature",
    "token",
    "x_amz_credential",
    "x_amz_security_token",
    "x_amz_signature",
    "x_goog_credential",
    "x_goog_signature",
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


def first_party(url: str, expected_domain: str) -> bool:
    host = urlparse(url).hostname or ""
    host = host.lower()
    return host == expected_domain or host.endswith("." + expected_domain)


def has_secret_query(url: str) -> bool:
    if not valid_url(url):
        return False
    for key, _value in parse_qsl(urlparse(url).query, keep_blank_values=True):
        normalized = key.lower().replace("-", "_")
        if normalized in SENSITIVE_QUERY_KEYS:
            return True
        if normalized.startswith(("x_amz_", "x_goog_")) and any(
            part in normalized for part in ("credential", "signature", "token")
        ):
            return True
    return False


def iter_urls(node: object, path: str = "root"):
    if isinstance(node, dict):
        for key, value in node.items():
            next_path = f"{path}.{key}"
            if isinstance(value, str) and (key == "url" or key.endswith("_url")):
                yield next_path, value
            yield from iter_urls(value, next_path)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from iter_urls(value, f"{path}[{index}]")


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def collect_offers(data: dict) -> tuple[list[dict], dict[str, str], dict[str, tuple[date | None, date | None]], Counter[str], int]:
    offers: list[dict] = []
    offer_stores: dict[str, str] = {}
    windows: dict[str, tuple[date | None, date | None]] = {}
    store_counts: Counter[str] = Counter()
    malformed_dates = 0

    for store in data.get("obchody") or []:
        if not isinstance(store, dict):
            continue
        store_id = str(store.get("id", "")).lower()
        store_start = parse_day(store.get("plati_od")) if store.get("plati_od") else None
        store_end = parse_day(store.get("plati_do")) if store.get("plati_do") else None
        if (store.get("plati_od") and not store_start) or (store.get("plati_do") and not store_end):
            malformed_dates += 1
        if store_start and store_end and store_start > store_end:
            malformed_dates += 1
        rows = store.get("polozky") or []
        store_counts[store_id] += len(rows)
        for item in rows:
            if not isinstance(item, dict):
                continue
            offers.append(item)
            offer_id = str(item.get("id", ""))
            offer_stores[offer_id] = store_id
            own_start = parse_day(item.get("plati_od")) if item.get("plati_od") else None
            own_end = parse_day(item.get("plati_do")) if item.get("plati_do") else None
            if (item.get("plati_od") and not own_start) or (item.get("plati_do") and not own_end):
                malformed_dates += 1
            start = own_start or store_start
            end = own_end or store_end
            if start and end and start > end:
                malformed_dates += 1
            windows[offer_id] = (start, end)
    return offers, offer_stores, windows, store_counts, malformed_dates


def history_by_product(data: dict) -> dict[str, set[str]]:
    result: dict[str, set[str]] = defaultdict(set)
    offers, _stores, _windows, _counts, _bad = collect_offers(data)
    for item in offers:
        product_id = str(item.get("product_id") or "")
        for point in item.get("historia_cien") or []:
            result[product_id].add(
                json.dumps(point, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="data/latest.json")
    parser.add_argument("--mode", choices=("latest", "archive"))
    parser.add_argument("--today", help="Reprodukovateľný dátum YYYY-MM-DD; default Europe/Bratislava.")
    parser.add_argument("--previous", help="Predchádzajúci dataset na kontrolu histórie a poklesu.")
    parser.add_argument(
        "--allow-missing-active",
        action="append",
        default=[],
        metavar="OFFER_ID",
        help=(
            "Opakovateľná výnimka pre aktívnu ponuku preukázateľne stiahnutú "
            "z first-party zdroja; vyžaduje --previous a presnú zhodu ID."
        ),
    )
    parser.add_argument("--archive-index", help="Index archívu, napr. data/archive/index.json.")
    parser.add_argument("--state", help="Trvalý data/routine-state.json po finalizácii.")
    parser.add_argument("--strict", action="store_true", help="Povýši obsahové warningy na chyby.")
    args = parser.parse_args()

    path = Path(args.path)
    mode = args.mode or ("archive" if "archive" in path.parts else "latest")
    today = parse_day(args.today) if args.today else datetime.now(ZoneInfo("Europe/Bratislava")).date()
    if not today:
        print("ERROR: --today musí byť platný dátum YYYY-MM-DD")
        return 1

    errors: list[str] = []
    warnings: list[str] = []
    try:
        raw_data = read_json(path)
        if not isinstance(raw_data, dict):
            raise ValueError("root nie je objekt")
        data: dict = raw_data
    except Exception as exc:
        print(f"ERROR: {path} sa nedá načítať ako JSON objekt: {exc}")
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

    offers, offer_stores, windows, store_counts, malformed_dates = collect_offers(data)
    for store_id, count in store_counts.items():
        if count < 20:
            warnings.append(f"{store_id}: iba {count} položiek; over kompletnosť letáku")
    if malformed_dates:
        errors.append(f"Neplatné alebo obrátené dátumy ponúk/obchodov: {malformed_dates}")

    ids = [str(item.get("id", "")) for item in offers]
    duplicates = [key for key, count in Counter(ids).items() if key and count > 1]
    if duplicates:
        errors.append(f"Duplicitné offer id: {len(duplicates)}")
    if any(not key for key in ids):
        errors.append("Niektorá ponuka nemá id")

    product_ids = [str(item.get("product_id", "")) for item in offers]
    missing_product = sum(not value for value in product_ids)
    prefixed = sum(bool(STORE_PREFIX.match(value)) for value in product_ids)
    if missing_product:
        errors.append(f"Ponuky bez product_id: {missing_product}")
    if prefixed:
        errors.append(f"product_id s prefixom obchodu: {prefixed}/{len(product_ids)}")

    invalid_prices = 0
    invalid_units = 0
    invalid_history = 0
    missing_history = 0
    missing_metro_vat = 0
    weak_verdict_reason = 0
    history_2plus = 0
    active = upcoming = expired = 0

    for item in offers:
        price = item.get("cena")
        if not isinstance(price, (int, float)) or isinstance(price, bool) or price < 0:
            invalid_prices += 1
        if item.get("jednotkova_cena") is not None and not item.get("jednotka"):
            invalid_units += 1
        history = item.get("historia_cien")
        if not isinstance(history, list):
            missing_history += 1
        else:
            if len(history) >= 2:
                history_2plus += 1
            for point in history:
                if not isinstance(point, dict) or not parse_day(point.get("datum")):
                    invalid_history += 1
                    continue
                hist_price = point.get("cena")
                if not isinstance(hist_price, (int, float)) or isinstance(hist_price, bool) or hist_price < 0:
                    invalid_history += 1
        offer_id = str(item.get("id", ""))
        start, end = windows.get(offer_id, (None, None))
        if end and end < today:
            expired += 1
        elif start and start > today:
            upcoming += 1
        else:
            active += 1
        store_id = offer_stores.get(offer_id, "")
        vat = item.get("cena_s_dph")
        if store_id == "metro" and (
            not isinstance(vat, (int, float)) or isinstance(vat, bool) or (isinstance(price, (int, float)) and vat < price)
        ):
            missing_metro_vat += 1
        if item.get("verdikt") in {"realna", "umela"}:
            reason = str(item.get("dovod_verdiktu") or "")
            if not re.search(r"\d", reason):
                weak_verdict_reason += 1
        if not item.get("kategoria"):
            errors.append(f"Ponuka {offer_id or '<bez id>'} nemá kategóriu")
        source_url = item.get("zdroj_url")
        if source_url is not None and not valid_url(source_url):
            errors.append(f"Ponuka {offer_id or '<bez id>'} má neplatný zdroj_url")

    if invalid_prices:
        errors.append(f"Neplatné ceny: {invalid_prices}")
    if invalid_units:
        errors.append(f"Jednotkové ceny bez jednotky: {invalid_units}")
    if missing_history:
        errors.append(f"Ponuky bez poľa historia_cien: {missing_history}")
    if invalid_history:
        errors.append(f"Neplatné historické body: {invalid_history}")
    if missing_metro_vat:
        errors.append(f"Metro ponuky bez platnej cena_s_dph: {missing_metro_vat}")
    if weak_verdict_reason:
        errors.append(f"Verdikt realna/umela bez číselného dôkazu: {weak_verdict_reason}")
    if mode == "latest" and expired:
        errors.append(f"Latest obsahuje {expired} expirovaných ponúk")

    top_ids = data.get("top_ids") or []
    if len(top_ids) != 10 or len(set(top_ids)) != 10:
        errors.append("top_ids musí obsahovať presne 10 unikátnych id")
    missing_top = sorted(set(top_ids) - set(ids))
    if missing_top:
        errors.append(f"top_ids odkazuje na {len(missing_top)} chýbajúcich ponúk")
    if mode == "latest":
        expired_top = [key for key in top_ids if windows.get(str(key), (None, None))[1] and windows[str(key)][1] < today]
        if expired_top:
            errors.append(f"top_ids obsahuje {len(expired_top)} expirovaných ponúk")
    top_mix = Counter(offer_stores.get(str(key), "") for key in top_ids)
    represented = {store for store, count in top_mix.items() if store and count}
    if len(represented) < min(3, len(store_counts)):
        errors.append("top_ids nemá zástupcu zo všetkých troch hlavných obchodov")

    promos = data.get("promo") or []
    promo_ids = [str(item.get("id", "")) for item in promos if isinstance(item, dict)]
    if len(promo_ids) != len(set(promo_ids)):
        errors.append("Promo id nie sú unikátne")
    bad_promo = priority_one = expired_promo = 0
    for promo in promos:
        if not isinstance(promo, dict):
            bad_promo += 1
            continue
        priority = promo.get("priorita")
        if priority == 1:
            priority_one += 1
        start = parse_day(promo.get("plati_od"))
        end = parse_day(promo.get("plati_do"))
        if (
            not promo.get("id")
            or not promo.get("text")
            or priority not in {1, 2, 3}
            or not valid_url(promo.get("zdroj_url"))
            or not start
            or not end
            or start > end
        ):
            bad_promo += 1
        elif mode == "latest" and end < today:
            expired_promo += 1
    if bad_promo:
        errors.append(f"Promo bez povinného kontraktu: {bad_promo}")
    if expired_promo:
        errors.append(f"Latest obsahuje {expired_promo} expirovaných promo")
    if promos and priority_one != 1:
        errors.append(f"Promo priority 1: {priority_one}; musí byť presne jedna Top akcia")

    opening = data.get("otvaracie_hodiny") or {}
    stores = opening.get("predajne") or []
    opening_ids = {str(item.get("id", "")).lower() for item in stores if isinstance(item, dict)}
    if opening_ids != EXPECTED_HOURS:
        errors.append(f"Otváracie hodiny musia mať presne Metro, Kaufland a Lidl; nájdené: {sorted(opening_ids)}")
    if not opening.get("poznamka_sviatky") or not valid_url(opening.get("zdroj_sviatky_url")):
        errors.append("Chýba explicitná sviatočná poznámka alebo oficiálny zdroj")
    checked_through = parse_day(opening.get("checked_through"))
    if not checked_through:
        errors.append("Otváracie hodiny nemajú platný checked_through")
    elif checked_through < today + timedelta(days=14):
        errors.append(f"Otváracie hodiny/sviatky sú skontrolované iba do {checked_through}; treba aspoň 14 dní")
    for store in stores:
        store_id = str(store.get("id", "")).lower()
        source = str(store.get("zdroj_url", ""))
        expected = FIRST_PARTY_HOSTS.get(store_id)
        if not valid_url(source) or (expected and not first_party(source, expected)):
            errors.append(f"{store_id}: zdroj hodín nie je first-party URL")
        verified = parse_day(store.get("overene"))
        if not verified:
            errors.append(f"{store_id}: chýba platný dátum overene")
        elif verified != today:
            warnings.append(f"{store_id}: hodiny nie sú overené dnes ({verified})")
        if not store.get("hodiny"):
            errors.append(f"{store_id}: chýbajú bežné hodiny")

    secret_urls = [location for location, url in iter_urls(data) if has_secret_query(url)]
    if secret_urls:
        errors.append("URL obsahujú citlivé query parametre: " + ", ".join(secret_urls[:5]))

    if args.previous:
        try:
            previous = read_json(Path(args.previous))
            if not isinstance(previous, dict):
                raise ValueError("root nie je objekt")
            old_offers, _old_stores, old_windows, _old_counts, _old_bad = collect_offers(previous)
            if old_offers and len(offers) < len(old_offers) * 0.75:
                errors.append(f"Nevysvetlený pokles ponúk: {len(old_offers)} -> {len(offers)}")
            old_history = history_by_product(previous)
            new_history = history_by_product(data)
            lost_points = sum(len(points - new_history.get(product_id, set())) for product_id, points in old_history.items() if product_id in new_history)
            if lost_points:
                errors.append(f"Stratené historické body pri existujúcich product_id: {lost_points}")
            current_ids = set(ids)
            missing_active: list[str] = []
            for old in old_offers:
                old_id = str(old.get("id", ""))
                old_end = old_windows.get(old_id, (None, None))[1]
                if old_id not in current_ids and (not old_end or old_end >= today):
                    missing_active.append(old_id)
            allowed_missing = set(args.allow_missing_active)
            unexpected_missing = sorted(set(missing_active) - allowed_missing)
            unused_allowances = sorted(allowed_missing - set(missing_active))
            if unexpected_missing:
                errors.append(
                    "Zmiznuté ešte aktívne ponuky oproti previous: "
                    f"{len(unexpected_missing)} ({', '.join(unexpected_missing[:5])})"
                )
            approved_missing = sorted(set(missing_active) & allowed_missing)
            if approved_missing:
                warnings.append(
                    "Schválené stiahnutie aktívnej ponuky z first-party zdroja: "
                    + ", ".join(approved_missing)
                )
            if unused_allowances:
                errors.append(
                    "Nepoužité alebo chybné --allow-missing-active ID: "
                    + ", ".join(unused_allowances)
                )
        except Exception as exc:
            errors.append(f"Previous dataset sa nedá overiť: {exc}")
    elif args.allow_missing_active:
        errors.append("--allow-missing-active vyžaduje --previous")

    if args.archive_index:
        try:
            index_path = Path(args.archive_index)
            index = read_json(index_path)
            if not isinstance(index, list) or any(not WEEK.fullmatch(str(item)) for item in index):
                raise ValueError("index musí byť pole YYYY-Www")
            if len(index) != len(set(index)) or index != sorted(index):
                errors.append("Archive index nie je unikátny a chronologicky zoradený")
            missing_files = [week for week in index if not (index_path.parent / f"{week}.json").is_file()]
            if missing_files:
                errors.append(f"Archive index odkazuje na {len(missing_files)} chýbajúcich súborov")
            if mode == "latest" and data.get("tyzden") not in index:
                errors.append("Aktuálny týždeň chýba v archive index")
        except Exception as exc:
            errors.append(f"Archive index sa nedá overiť: {exc}")

    if args.state:
        try:
            state = read_json(Path(args.state))
            if not isinstance(state, dict):
                raise ValueError("root nie je objekt")
            migration = state.get("product_id_migration") or {}
            if prefixed == 0 and migration.get("status") != "complete":
                errors.append("product_id migrácia je v dátach hotová, ale routine-state nie je complete")
            if migration.get("status") == "complete" and not state.get("last_success"):
                errors.append("routine-state má complete migráciu bez last_success")
            if migration.get("status") == "complete" and not state.get("source_manifest"):
                errors.append("routine-state po úspešnom behu nemá source_manifest")
            baseline = state.get("quality_baseline") or {}
            if baseline.get("offers") != len(offers):
                errors.append("routine-state quality_baseline.offers nesedí s datasetom")
        except Exception as exc:
            errors.append(f"Routine state sa nedá overiť: {exc}")

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

    print(f"DATA: {path} (mode={mode}, today={today}, timezone=Europe/Bratislava)")
    print(
        "SUMMARY: "
        f"offers={len(offers)} stores={dict(store_counts)} promos={len(promos)} "
        f"top={len(top_ids)} active={active} upcoming={upcoming} expired={expired} "
        f"history_2plus={history_2plus}"
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
