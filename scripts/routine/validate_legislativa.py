#!/usr/bin/env python3
"""Fail-closed contract for the public legal checklist.

The file is curated content, not legal advice. This validator checks only its
published shape, bounded text, stable UI identities and first-party sources;
it cannot confirm that a legal statement is substantively correct.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlparse
from zoneinfo import ZoneInfo


MAX_BYTES = 512 * 1024
ROOT_FIELDS = {"aktualizovane", "popis", "upozornenie", "terminy", "kategorie", "portaly"}
DEADLINE_REQUIRED = {"datum", "nazov", "detail"}
DEADLINE_FIELDS = DEADLINE_REQUIRED | {"dph"}
CATEGORY_FIELDS = {"id", "nazov", "ikona", "popis", "polozky"}
ITEM_REQUIRED = {
    "nazov", "detail", "kedy", "koho", "zdroj", "zdroj_nazov", "confidence", "zavaznost"
}
ITEM_FIELDS = ITEM_REQUIRED | {"ucinne_od", "dph"}
PORTAL_FIELDS = {"nazov", "url", "co", "newsletter"}
CONFIDENCE = {"high", "medium", "low"}
DPH = {"platca", "neplatca"}
ICONS = {"tag", "doc", "shield", "cart", "settings", "alert"}
SLUG_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
BAD_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]")
OFFICIAL_HOSTS = {
    "echa.europa.eu",
    "eur-lex.europa.eu",
    "static.slov-lex.sk",
    "svps.sk",
    "www.cchlp.sk",
    "www.economy.gov.sk",
    "www.employment.gov.sk",
    "www.financnasprava.sk",
    "www.mhsr.sk",
    "www.minzp.sk",
    "www.slov-lex.sk",
    "www.slovensko.sk",
    "www.socpoist.sk",
    "www.soi.sk",
    "www.svps.sk",
    "www.uvzsr.sk",
    "www.vlada.gov.sk",
}
SENSITIVE_QUERY_KEYS = {
    "access_token", "api_key", "apikey", "auth", "bearer", "client_secret",
    "credential", "password", "secret", "sig", "signature", "token",
}


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
    raw = path.read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError(f"súbor prekračuje {MAX_BYTES} bajtov")
    return json.loads(
        raw.decode("utf-8"),
        object_pairs_hook=reject_duplicate_keys,
        parse_constant=reject_nonfinite,
    )


def exact_object(value: object, fields: set[str], path: str, errors: list[str], required=None) -> dict | None:
    if not isinstance(value, dict):
        errors.append(f"{path} musí byť objekt")
        return None
    required = fields if required is None else required
    missing = sorted(required - set(value))
    extra = sorted(set(value) - fields)
    if missing:
        errors.append(f"{path} chýbajú polia: {', '.join(missing)}")
    if extra:
        errors.append(f"{path} má neznáme polia: {', '.join(extra)}")
    return value


def text(value: object, path: str, errors: list[str], *, minimum=1, maximum=2000) -> str:
    if not isinstance(value, str) or not minimum <= len(value) <= maximum or BAD_TEXT.search(value):
        errors.append(f"{path} musí byť bezpečný text dĺžky {minimum}..{maximum}")
        return ""
    return value


def iso_day(value: object, path: str, errors: list[str]) -> date | None:
    try:
        parsed = date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        parsed = None
    if parsed is None:
        errors.append(f"{path} musí byť dátum YYYY-MM-DD")
    return parsed


def official_url(value: object, path: str, errors: list[str]) -> str:
    if not isinstance(value, str) or not value or len(value) > 2048 or any(c.isspace() for c in value):
        errors.append(f"{path} musí byť krátka HTTPS URL oficiálneho zdroja")
        return ""
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower().rstrip(".")
        valid = (
            parsed.scheme == "https"
            and host in OFFICIAL_HOSTS
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
        )
    except (UnicodeError, ValueError):
        valid = False
        parsed = None
    if not valid:
        errors.append(f"{path} nie je URL na povolenej oficiálnej doméne")
        return ""
    for key, _ in parse_qsl(parsed.query, keep_blank_values=True):
        normalized = key.lower().replace("-", "_")
        if normalized in SENSITIVE_QUERY_KEYS or (
            normalized.startswith(("x_amz_", "x_goog_"))
            and any(part in normalized for part in ("credential", "signature", "token"))
        ):
            errors.append(f"{path} obsahuje citlivý query parameter")
            break
    return value


def ui_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", normalized))[:80] or "polozka"


def validate(path: Path) -> tuple[list[str], list[str], dict[str, int]]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        value = read_json(path)
    except Exception as exc:
        return [f"{path}: {exc}"], warnings, {}
    root = exact_object(value, ROOT_FIELDS, "root", errors)
    if root is None:
        return errors, warnings, {}

    updated = iso_day(root.get("aktualizovane"), "root.aktualizovane", errors)
    today = datetime.now(ZoneInfo("Europe/Bratislava")).date()
    if updated and updated > today:
        errors.append("root.aktualizovane nesmie byť v budúcnosti")
    elif updated and (today - updated).days > 90:
        warnings.append(f"legislatívny obsah nebol skontrolovaný {(today - updated).days} dní")
    text(root.get("popis"), "root.popis", errors, maximum=3000)
    text(root.get("upozornenie"), "root.upozornenie", errors, maximum=3000)

    deadlines = root.get("terminy")
    if not isinstance(deadlines, list) or len(deadlines) > 50:
        errors.append("root.terminy musí byť pole s najviac 50 položkami")
        deadlines = []
    deadline_keys: set[tuple[str, str]] = set()
    for index, raw in enumerate(deadlines):
        item = exact_object(raw, DEADLINE_FIELDS, f"root.terminy[{index}]", errors, DEADLINE_REQUIRED)
        if item is None:
            continue
        day = iso_day(item.get("datum"), f"root.terminy[{index}].datum", errors)
        name = text(item.get("nazov"), f"root.terminy[{index}].nazov", errors, maximum=200)
        text(item.get("detail"), f"root.terminy[{index}].detail", errors, maximum=1500)
        if item.get("dph") is not None and item.get("dph") not in DPH:
            errors.append(f"root.terminy[{index}].dph má neznámu hodnotu")
        key = (day.isoformat() if day else "", name.casefold())
        if key in deadline_keys:
            errors.append(f"root.terminy[{index}] duplikuje termín")
        deadline_keys.add(key)

    categories = root.get("kategorie")
    if not isinstance(categories, list) or not 1 <= len(categories) <= 20:
        errors.append("root.kategorie musí mať 1..20 položiek")
        categories = []
    category_ids: set[str] = set()
    item_count = 0
    for category_index, raw_category in enumerate(categories):
        prefix = f"root.kategorie[{category_index}]"
        category = exact_object(raw_category, CATEGORY_FIELDS, prefix, errors)
        if category is None:
            continue
        category_id = text(category.get("id"), f"{prefix}.id", errors, maximum=60)
        if category_id and not SLUG_ID.fullmatch(category_id):
            errors.append(f"{prefix}.id musí byť stabilný slug")
        if category_id in category_ids:
            errors.append(f"{prefix}.id je duplicitné")
        category_ids.add(category_id)
        text(category.get("nazov"), f"{prefix}.nazov", errors, maximum=160)
        if category.get("ikona") not in ICONS:
            errors.append(f"{prefix}.ikona má neznámu hodnotu")
        text(category.get("popis"), f"{prefix}.popis", errors, maximum=1000)
        items = category.get("polozky")
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            errors.append(f"{prefix}.polozky musí mať 1..100 položiek")
            continue
        slugs: set[str] = set()
        item_count += len(items)
        for item_index, raw_item in enumerate(items):
            item_path = f"{prefix}.polozky[{item_index}]"
            item = exact_object(raw_item, ITEM_FIELDS, item_path, errors, ITEM_REQUIRED)
            if item is None:
                continue
            name = text(item.get("nazov"), f"{item_path}.nazov", errors, maximum=240)
            slug = ui_slug(name)
            if slug in slugs:
                errors.append(f"{item_path}.nazov koliduje v UI s inou položkou")
            slugs.add(slug)
            text(item.get("detail"), f"{item_path}.detail", errors, maximum=5000)
            text(item.get("kedy"), f"{item_path}.kedy", errors, maximum=240)
            text(item.get("koho"), f"{item_path}.koho", errors, maximum=240)
            official_url(item.get("zdroj"), f"{item_path}.zdroj", errors)
            text(item.get("zdroj_nazov"), f"{item_path}.zdroj_nazov", errors, maximum=240)
            if item.get("confidence") not in CONFIDENCE:
                errors.append(f"{item_path}.confidence má neznámu hodnotu")
            severity = item.get("zavaznost")
            if type(severity) is not int or not 1 <= severity <= 5:
                errors.append(f"{item_path}.zavaznost musí byť celé číslo 1..5")
            if item.get("ucinne_od") is not None:
                iso_day(item.get("ucinne_od"), f"{item_path}.ucinne_od", errors)
            if item.get("dph") is not None and item.get("dph") not in DPH:
                errors.append(f"{item_path}.dph má neznámu hodnotu")

    portals = root.get("portaly")
    if not isinstance(portals, list) or len(portals) > 50:
        errors.append("root.portaly musí byť pole s najviac 50 položkami")
        portals = []
    portal_names: set[str] = set()
    for index, raw in enumerate(portals):
        portal_path = f"root.portaly[{index}]"
        portal = exact_object(raw, PORTAL_FIELDS, portal_path, errors)
        if portal is None:
            continue
        name = text(portal.get("nazov"), f"{portal_path}.nazov", errors, maximum=200)
        if name.casefold() in portal_names:
            errors.append(f"{portal_path}.nazov je duplicitné")
        portal_names.add(name.casefold())
        official_url(portal.get("url"), f"{portal_path}.url", errors)
        text(portal.get("co"), f"{portal_path}.co", errors, maximum=1500)
        text(portal.get("newsletter"), f"{portal_path}.newsletter", errors, maximum=300)

    return errors, warnings, {
        "deadlines": len(deadlines),
        "categories": len(categories),
        "items": item_count,
        "portals": len(portals),
    }


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) == 2 else "data/legislativa.json")
    errors, warnings, counts = validate(path)
    for warning in warnings:
        print("WARNING:", warning)
    for error in errors[:100]:
        print("ERROR:", error)
    if len(errors) > 100:
        print(f"ERROR: ďalších {len(errors) - 100} chýb bolo skrátených")
    if errors:
        print(f"RESULT: BLOCKED ({len(errors)} errors, {len(warnings)} warnings)")
        return 1
    print(f"RESULT: PASS {counts} ({len(warnings)} warnings)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
