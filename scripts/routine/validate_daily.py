#!/usr/bin/env python3
"""Deterministická publish brána pre automatickú dátovú pipeline.

Skript nepoužíva externé balíky. Kontroluje business kontrakt, platnosť
zdedenú z obchodu, TOP/promo, prevádzkové údaje a voliteľne aj zachovanie
histórie oproti predchádzajúcemu datasetu.
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
WEEK = re.compile(r"^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$")
SLUG_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RFC3339 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)
EXPECTED_HOURS = {"metro", "kaufland", "lidl"}
VERDICTS = {"realna", "umela", "neoverene"}
VERIFICATION_STATUSES = {"verified", "stale", "unavailable"}
METRO_MARKETING_PROMO_RE = re.compile(
    r"\b(?:zadarmo|odmena|vezmite|získajte|získate|navyše|ušetrite|super|VIP)\b"
    r"|akciov[áa]\s+cena|→|!",
    re.I,
)
MAX_URL_LENGTH = 2048
MAX_MONEY = 1_000_000
MAX_CONTRACT_ERRORS = 100
ALLOWED_URL_HOSTS = {
    "predajne.kaufland.sk",
    "www.lidl.sk",
    "www.metro.sk",
    "letaky.metro.sk",
    "letak.billa.sk",
    "www.billa.sk",
    "www.coop.sk",
    "www.tesco.sk",
    "potravinydomov.itesco.sk",
    "www.dm.sk",
    "www.mojadm.sk",
    "www.tetadrogerie.sk",
    "www.vlada.gov.sk",
}
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
ROOT_FIELDS = ROOT_REQUIRED
PROMO_FIELDS = {
    "id", "obchod", "text", "plati_od", "plati_do", "podmienka", "priorita", "zdroj_url"
}
OFFER_REQUIRED = {
    "id", "product_id", "nazov", "mnozstvo", "kategoria", "cena", "cena_s_dph",
    "cena_povodna", "cena_povodna_s_dph", "jednotkova_cena", "jednotka",
    "zlava_letak_pct", "zlava_realna_pct", "bezna_cena_60d", "verdikt",
    "dovod_verdiktu", "podmienka", "poznamka", "zdroj_url", "historia_cien",
}
OFFER_FIELDS = OFFER_REQUIRED | {"plati_od", "plati_do"}
HISTORY_REQUIRED = {"datum", "cena", "obchod", "zdroj_url"}
HISTORY_FIELDS = HISTORY_REQUIRED | {"cena_s_dph"}
STORE_REQUIRED = {"id", "nazov", "plati_od", "plati_do", "letak_url", "polozky"}
STORE_FIELDS = STORE_REQUIRED | {"poznamka"}
OPENING_REQUIRED = {
    "obdobie", "checked_through", "lokalita", "poznamka_sviatky",
    "zdroj_sviatky_url", "predajne",
}
OPENING_STORE_REQUIRED = {"id", "nazov", "adresa", "hodiny", "vynimky", "zdroj_url", "overene"}
OPENING_STORE_FIELDS = OPENING_STORE_REQUIRED | {"stav_overenia", "poznamka_overenia"}
HOURS_ROW_FIELDS = {"dni", "cas"}
EXCEPTION_FIELDS = {"datum", "nazov", "cas"}
SOURCE_STATUS_FIELDS = {"zdroj", "ok", "url", "poznamka"}
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
    """Publikované odkazy musia byť HTTPS a smerovať na schválený host."""
    if not isinstance(value, str) or not value or len(value) > MAX_URL_LENGTH:
        return False
    if any(char.isspace() for char in value):
        return False
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().rstrip(".")
        try:
            host.encode("ascii")
        except UnicodeEncodeError:
            return False
        return (
            parsed.scheme == "https"
            and bool(parsed.netloc)
            and host in ALLOWED_URL_HOSTS
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
        )
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


def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
    result: dict = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicitný JSON kľúč: {key}")
        result[key] = value
    return result


def reject_nonfinite(value: str) -> None:
    raise ValueError(f"neplatné ne-konečné JSON číslo: {value}")


def read_json(path: Path) -> object:
    return json.loads(
        path.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
        parse_constant=reject_nonfinite,
    )


def contract_error(errors: list[str], message: str) -> None:
    if len(errors) < MAX_CONTRACT_ERRORS:
        errors.append("Kontrakt: " + message)
    elif len(errors) == MAX_CONTRACT_ERRORS:
        errors.append(f"Kontrakt: ďalšie chyby boli skrátené po {MAX_CONTRACT_ERRORS} záznamoch")


def check_fields(
    value: object,
    path: str,
    required: set[str],
    allowed: set[str],
    errors: list[str],
) -> dict | None:
    if not isinstance(value, dict):
        contract_error(errors, f"{path} musí byť objekt")
        return None
    missing = sorted(required - set(value))
    unknown = sorted(set(value) - allowed)
    if missing:
        contract_error(errors, f"{path} chýbajú polia: {', '.join(missing)}")
    if unknown:
        contract_error(errors, f"{path} obsahuje neznáme polia: {', '.join(unknown)}")
    return value


def check_array(
    value: object,
    path: str,
    errors: list[str],
    *,
    minimum: int = 0,
    maximum: int,
) -> list | None:
    if not isinstance(value, list):
        contract_error(errors, f"{path} musí byť pole")
        return None
    if not minimum <= len(value) <= maximum:
        contract_error(errors, f"{path} má {len(value)} prvkov; povolené je {minimum} až {maximum}")
    return value


def check_text(
    value: object,
    path: str,
    errors: list[str],
    *,
    maximum: int,
    minimum: int = 0,
    nullable: bool = False,
) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str):
        contract_error(errors, f"{path} musí byť text{' alebo null' if nullable else ''}")
        return
    if not minimum <= len(value) <= maximum:
        contract_error(errors, f"{path} má nepovolenú dĺžku {len(value)}; maximum je {maximum}")


def check_slug(value: object, path: str, errors: list[str], *, maximum: int = 160) -> None:
    check_text(value, path, errors, minimum=1, maximum=maximum)
    if isinstance(value, str) and not SLUG_ID.fullmatch(value):
        contract_error(errors, f"{path} nie je kanonické slug ID")


def check_date(value: object, path: str, errors: list[str], *, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) or not parse_day(value):
        contract_error(errors, f"{path} musí byť platný dátum YYYY-MM-DD")


def check_number(
    value: object,
    path: str,
    errors: list[str],
    *,
    minimum: float,
    maximum: float,
    nullable: bool = False,
) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        contract_error(errors, f"{path} musí byť číslo{' alebo null' if nullable else ''}")
        return
    if not minimum <= value <= maximum:
        contract_error(errors, f"{path}={value} je mimo rozsahu {minimum} až {maximum}")


def check_https(value: object, path: str, errors: list[str], *, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not valid_url(value):
        contract_error(errors, f"{path} musí byť HTTPS URL bez credentials, whitespace a nadmernej dĺžky")


def validate_history_point(point: object, path: str, errors: list[str]) -> None:
    row = check_fields(point, path, HISTORY_REQUIRED, HISTORY_FIELDS, errors)
    if row is None:
        return
    check_date(row.get("datum"), f"{path}.datum", errors)
    check_number(row.get("cena"), f"{path}.cena", errors, minimum=0, maximum=MAX_MONEY)
    if "cena_s_dph" in row:
        check_number(row.get("cena_s_dph"), f"{path}.cena_s_dph", errors, minimum=0, maximum=MAX_MONEY, nullable=True)
    check_text(row.get("obchod"), f"{path}.obchod", errors, maximum=80, nullable=True)
    check_https(row.get("zdroj_url"), f"{path}.zdroj_url", errors, nullable=True)


def validate_offer(offer: object, path: str, errors: list[str]) -> None:
    row = check_fields(offer, path, OFFER_REQUIRED, OFFER_FIELDS, errors)
    if row is None:
        return
    check_slug(row.get("id"), f"{path}.id", errors)
    check_slug(row.get("product_id"), f"{path}.product_id", errors, maximum=120)
    product_id = row.get("product_id")
    if isinstance(product_id, str) and STORE_PREFIX.match(product_id):
        contract_error(errors, f"{path}.product_id nesmie mať prefix obchodu")
    check_text(row.get("nazov"), f"{path}.nazov", errors, minimum=1, maximum=200)
    check_text(row.get("mnozstvo"), f"{path}.mnozstvo", errors, maximum=120, nullable=True)
    check_text(row.get("kategoria"), f"{path}.kategoria", errors, minimum=1, maximum=80)
    for field in ("cena",):
        check_number(row.get(field), f"{path}.{field}", errors, minimum=0, maximum=MAX_MONEY)
    for field in ("cena_s_dph", "cena_povodna", "cena_povodna_s_dph", "jednotkova_cena", "bezna_cena_60d"):
        check_number(row.get(field), f"{path}.{field}", errors, minimum=0, maximum=MAX_MONEY, nullable=True)
    check_text(row.get("jednotka"), f"{path}.jednotka", errors, maximum=32, nullable=True)
    check_number(row.get("zlava_letak_pct"), f"{path}.zlava_letak_pct", errors, minimum=0, maximum=100, nullable=True)
    check_number(row.get("zlava_realna_pct"), f"{path}.zlava_realna_pct", errors, minimum=-100, maximum=100, nullable=True)
    if row.get("verdikt") not in VERDICTS:
        contract_error(errors, f"{path}.verdikt musí byť jedno z {sorted(VERDICTS)}")
    check_text(row.get("dovod_verdiktu"), f"{path}.dovod_verdiktu", errors, maximum=500, nullable=True)
    check_text(row.get("podmienka"), f"{path}.podmienka", errors, maximum=500, nullable=True)
    check_text(row.get("poznamka"), f"{path}.poznamka", errors, maximum=1000, nullable=True)
    check_https(row.get("zdroj_url"), f"{path}.zdroj_url", errors, nullable=True)
    for field in ("plati_od", "plati_do"):
        if field in row:
            check_date(row.get(field), f"{path}.{field}", errors, nullable=True)
    history = check_array(row.get("historia_cien"), f"{path}.historia_cien", errors, maximum=16)
    if history is not None:
        for index, point in enumerate(history):
            validate_history_point(point, f"{path}.historia_cien[{index}]", errors)


def validate_store(store: object, path: str, errors: list[str]) -> None:
    row = check_fields(store, path, STORE_REQUIRED, STORE_FIELDS, errors)
    if row is None:
        return
    check_slug(row.get("id"), f"{path}.id", errors, maximum=32)
    check_text(row.get("nazov"), f"{path}.nazov", errors, minimum=1, maximum=80)
    check_date(row.get("plati_od"), f"{path}.plati_od", errors, nullable=True)
    check_date(row.get("plati_do"), f"{path}.plati_do", errors, nullable=True)
    check_https(row.get("letak_url"), f"{path}.letak_url", errors, nullable=True)
    if "poznamka" in row:
        check_text(row.get("poznamka"), f"{path}.poznamka", errors, maximum=1000, nullable=True)
    offers = check_array(row.get("polozky"), f"{path}.polozky", errors, maximum=5000)
    if offers is not None:
        for index, offer in enumerate(offers):
            validate_offer(offer, f"{path}.polozky[{index}]", errors)


def validate_promo(promo: object, path: str, errors: list[str]) -> None:
    row = check_fields(promo, path, PROMO_FIELDS, PROMO_FIELDS, errors)
    if row is None:
        return
    check_slug(row.get("id"), f"{path}.id", errors)
    check_text(row.get("obchod"), f"{path}.obchod", errors, minimum=1, maximum=80)
    check_text(row.get("text"), f"{path}.text", errors, minimum=1, maximum=500)
    check_date(row.get("plati_od"), f"{path}.plati_od", errors)
    check_date(row.get("plati_do"), f"{path}.plati_do", errors)
    check_text(row.get("podmienka"), f"{path}.podmienka", errors, maximum=500, nullable=True)
    priority = row.get("priorita")
    if not isinstance(priority, int) or isinstance(priority, bool) or priority not in {1, 2, 3}:
        contract_error(errors, f"{path}.priorita musí byť celé číslo 1, 2 alebo 3")
    check_https(row.get("zdroj_url"), f"{path}.zdroj_url", errors)


def validate_opening_hours(opening: object, path: str, errors: list[str]) -> None:
    row = check_fields(opening, path, OPENING_REQUIRED, OPENING_REQUIRED, errors)
    if row is None:
        return
    check_text(row.get("obdobie"), f"{path}.obdobie", errors, minimum=1, maximum=120)
    check_date(row.get("checked_through"), f"{path}.checked_through", errors)
    check_text(row.get("lokalita"), f"{path}.lokalita", errors, minimum=1, maximum=200)
    check_text(row.get("poznamka_sviatky"), f"{path}.poznamka_sviatky", errors, maximum=1000, nullable=True)
    check_https(row.get("zdroj_sviatky_url"), f"{path}.zdroj_sviatky_url", errors, nullable=True)
    stores = check_array(row.get("predajne"), f"{path}.predajne", errors, minimum=3, maximum=3)
    if stores is None:
        return
    for index, store in enumerate(stores):
        store_path = f"{path}.predajne[{index}]"
        item = check_fields(store, store_path, OPENING_STORE_REQUIRED, OPENING_STORE_FIELDS, errors)
        if item is None:
            continue
        if item.get("id") not in EXPECTED_HOURS:
            contract_error(errors, f"{store_path}.id musí byť metro, kaufland alebo lidl")
        check_text(item.get("nazov"), f"{store_path}.nazov", errors, minimum=1, maximum=80)
        check_text(item.get("adresa"), f"{store_path}.adresa", errors, maximum=120, nullable=True)
        check_https(item.get("zdroj_url"), f"{store_path}.zdroj_url", errors)
        check_date(item.get("overene"), f"{store_path}.overene", errors)
        if "stav_overenia" in item and item.get("stav_overenia") not in VERIFICATION_STATUSES:
            contract_error(
                errors,
                f"{store_path}.stav_overenia musí byť jedno z {sorted(VERIFICATION_STATUSES)}",
            )
        if "poznamka_overenia" in item:
            check_text(
                item.get("poznamka_overenia"),
                f"{store_path}.poznamka_overenia",
                errors,
                maximum=300,
                nullable=True,
            )
        hours = check_array(item.get("hodiny"), f"{store_path}.hodiny", errors, minimum=1, maximum=14)
        if hours is not None:
            for row_index, hour in enumerate(hours):
                hour_path = f"{store_path}.hodiny[{row_index}]"
                hour_row = check_fields(hour, hour_path, HOURS_ROW_FIELDS, HOURS_ROW_FIELDS, errors)
                if hour_row is not None:
                    check_text(hour_row.get("dni"), f"{hour_path}.dni", errors, minimum=1, maximum=80)
                    check_text(hour_row.get("cas"), f"{hour_path}.cas", errors, minimum=1, maximum=40)
        exceptions = check_array(item.get("vynimky"), f"{store_path}.vynimky", errors, maximum=50)
        if exceptions is not None:
            for row_index, exception in enumerate(exceptions):
                exception_path = f"{store_path}.vynimky[{row_index}]"
                exception_row = check_fields(
                    exception, exception_path, EXCEPTION_FIELDS, EXCEPTION_FIELDS, errors
                )
                if exception_row is not None:
                    check_date(exception_row.get("datum"), f"{exception_path}.datum", errors)
                    check_text(exception_row.get("nazov"), f"{exception_path}.nazov", errors, minimum=1, maximum=120)
                    check_text(exception_row.get("cas"), f"{exception_path}.cas", errors, minimum=1, maximum=40)


def validate_source_status(source: object, path: str, errors: list[str]) -> None:
    row = check_fields(source, path, SOURCE_STATUS_FIELDS, SOURCE_STATUS_FIELDS, errors)
    if row is None:
        return
    check_text(row.get("zdroj"), f"{path}.zdroj", errors, minimum=1, maximum=120)
    if not isinstance(row.get("ok"), bool):
        contract_error(errors, f"{path}.ok musí byť boolean")
    check_https(row.get("url"), f"{path}.url", errors, nullable=True)
    check_text(row.get("poznamka"), f"{path}.poznamka", errors, maximum=2000, nullable=True)


def validate_contract(data: dict, errors: list[str]) -> None:
    root = check_fields(data, "root", ROOT_REQUIRED, ROOT_FIELDS, errors)
    if root is None:
        return
    if not isinstance(root.get("schema_version"), int) or isinstance(root.get("schema_version"), bool) or root.get("schema_version") != 2:
        contract_error(errors, "root.schema_version musí byť celé číslo 2")
    week = root.get("tyzden")
    week_match = WEEK.fullmatch(week) if isinstance(week, str) else None
    if not week_match:
        contract_error(errors, "root.tyzden musí byť platný ISO týždeň YYYY-Www")
    else:
        try:
            date.fromisocalendar(int(week_match.group(1)), int(week_match.group(2)), 1)
        except ValueError:
            contract_error(errors, "root.tyzden neexistuje v ISO kalendári")
    check_text(root.get("obdobie"), "root.obdobie", errors, maximum=120, nullable=True)
    generated = root.get("generovane")
    if not isinstance(generated, str) or len(generated) > 35 or not RFC3339.fullmatch(generated):
        contract_error(errors, "root.generovane musí byť RFC 3339 text s časovou zónou")
    else:
        try:
            parsed = datetime.fromisoformat(generated.replace("Z", "+00:00"))
            if parsed.tzinfo is None or parsed.utcoffset() is None:
                raise ValueError("chýba timezone")
        except ValueError:
            contract_error(errors, "root.generovane musí byť RFC 3339 dátum s explicitnou časovou zónou")

    promos = check_array(root.get("promo"), "root.promo", errors, maximum=200)
    if promos is not None:
        for index, promo in enumerate(promos):
            validate_promo(promo, f"root.promo[{index}]", errors)
    top_ids = check_array(root.get("top_ids"), "root.top_ids", errors, minimum=10, maximum=10)
    if top_ids is not None:
        for index, offer_id in enumerate(top_ids):
            check_slug(offer_id, f"root.top_ids[{index}]", errors)
    stores = check_array(root.get("obchody"), "root.obchody", errors, minimum=1, maximum=10)
    if stores is not None:
        for index, store in enumerate(stores):
            validate_store(store, f"root.obchody[{index}]", errors)
    validate_opening_hours(root.get("otvaracie_hodiny"), "root.otvaracie_hodiny", errors)
    sources = check_array(root.get("zdroje_stav"), "root.zdroje_stav", errors, minimum=1, maximum=50)
    if sources is not None:
        for index, source in enumerate(sources):
            validate_source_status(source, f"root.zdroje_stav[{index}]", errors)


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
    parser.add_argument(
        "--snapshot",
        action="store_true",
        help=(
            "Validuje obsah latest voči dňu jeho generovania, ale stále odmietne "
            "timestamp v budúcnosti. Určené pre reprodukovateľný CI; živý monitor "
            "tento prepínač nepoužíva."
        ),
    )
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

    # Najprv striktne overíme celý publikovaný tvar. Business kontroly nižšie
    # potom môžu bezpečne pracovať s garantovanými typmi a poľami.
    validate_contract(data, errors)
    if errors:
        print(f"DATA: {path} (mode={mode}, today={today}, timezone=Europe/Bratislava)")
        for error in errors:
            print("ERROR:", error)
        print(f"RESULT: BLOCKED ({len(errors)} contract errors, 0 warnings)")
        return 1

    generated_at = datetime.fromisoformat(str(data["generovane"]).replace("Z", "+00:00"))
    generated_day = generated_at.astimezone(ZoneInfo("Europe/Bratislava")).date()
    if generated_day > today:
        errors.append(f"generovane je v budúcnosti ({generated_day} > {today})")
    evaluation_day = generated_day if args.snapshot else today

    week = str(data.get("tyzden", ""))
    if mode == "latest":
        iso = evaluation_day.isocalendar()
        expected_week = f"{iso.year}-W{iso.week:02d}"
        if week != expected_week:
            reference = "pri generovaní" if args.snapshot else "dnes"
            errors.append(f"Latest má týždeň {week}; {reference} musí byť {expected_week}")
    elif path.stem != week:
        errors.append(f"Názov archívneho súboru {path.name} sa nezhoduje s root.tyzden {week}")

    # Archív je nemenný historický snapshot. Jeho vtedajšiu čerstvosť
    # posudzujeme voči dátumu generovania, nie voči dnešnému dňu.
    freshness_day = evaluation_day if mode == "latest" else generated_day

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
        if end and end < evaluation_day:
            expired += 1
        elif start and start > evaluation_day:
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
        expected_domain = FIRST_PARTY_HOSTS.get(store_id)
        if (
            not valid_url(source_url)
            or (expected_domain and not first_party(str(source_url), expected_domain))
        ):
            errors.append(f"Ponuka {offer_id or '<bez id>'} nemá first-party zdroj_url")

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
        expired_top = [
            key for key in top_ids
            if windows.get(str(key), (None, None))[1]
            and windows[str(key)][1] < evaluation_day
        ]
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
    bad_promo = priority_one = expired_promo = metro_marketing_copy = 0
    for promo in promos:
        if not isinstance(promo, dict):
            bad_promo += 1
            continue
        priority = promo.get("priorita")
        if priority == 1:
            priority_one += 1
        if str(promo.get("obchod", "")).strip().lower() == "metro" and METRO_MARKETING_PROMO_RE.search(
            str(promo.get("text", ""))
        ):
            metro_marketing_copy += 1
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
        elif mode == "latest" and end < evaluation_day:
            expired_promo += 1
    if bad_promo:
        errors.append(f"Promo bez povinného kontraktu: {bad_promo}")
    if expired_promo:
        errors.append(f"Latest obsahuje {expired_promo} expirovaných promo")
    if metro_marketing_copy:
        errors.append(
            f"METRO promo obsahuje marketingovú formuláciu namiesto vecnej parafrázy: {metro_marketing_copy}"
        )
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
    elif checked_through < freshness_day + timedelta(days=14):
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
        elif verified != freshness_day:
            reference = "k referenčnému dňu snapshotu" if args.snapshot or mode == "archive" else "dnes"
            warnings.append(f"{store_id}: hodiny nie sú overené {reference} ({verified})")
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
                if old_id not in current_ids and (not old_end or old_end >= evaluation_day):
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

    history_ratio = (history_2plus / len(offers) * 100) if offers else 0
    unverified = sum(item.get("verdikt") == "neoverene" for item in offers)
    unverified_ratio = (unverified / len(offers) * 100) if offers else 0
    if history_ratio < 10:
        warnings.append(f"Iba {history_ratio:.1f} % ponúk má aspoň 2 historické body")
    if unverified_ratio > 80:
        warnings.append(f"{unverified_ratio:.1f} % ponúk má verdikt neoverene")
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
