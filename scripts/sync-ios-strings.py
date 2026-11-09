#!/usr/bin/env python3
"""Regenerates the iOS Localizable.strings files from the Android strings.xml files
(the source of truth for mobile strings), converting %1$s -> %1$@ and %1$d -> %1$ld."""
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _other(plurals):
    item = next(i for i in plurals if i.get("quantity") == "other")
    item.set("name", plurals.get("name"))
    return item


for src, lang in [("values", "en"), ("values-es", "es")]:
    xml_path = ROOT / f"android/app/src/main/res/{src}/strings.xml"
    out = [f"/* Generated from android/app/src/main/res/{src}/strings.xml by scripts/sync-ios-strings.py */"]
    for el in ET.parse(xml_path).getroot():
        if el.tag == "plurals":  # iOS gets the "other" form as a plain string
            el = _other(el)
        elif el.tag != "string":
            continue
        v = (el.text or "").replace("\\'", "'").replace('\\"', '"')
        v = re.sub(r"%(\d)\$s", r"%\1$@", v)
        v = re.sub(r"%(\d)\$d", r"%\1$ld", v)
        v = v.replace("\\", "\\\\").replace('"', '\\"')
        out.append(f'"{el.get("name")}" = "{v}";')
    dest = ROOT / f"ios/Sources/GradesCalculator/Resources/{lang}.lproj/Localizable.strings"
    dest.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {dest.relative_to(ROOT)}")
