#!/usr/bin/env python3
"""Checks that every platform has the same translation keys in English and Spanish."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ok = True

def report(name, a, b):
    global ok
    if a != b:
        ok = False
        print(f"{name}: only in en: {sorted(a - b)}; only in es: {sorted(b - a)}")
    else:
        print(f"{name}: {len(a)} keys OK")

def flat(d, p=""):
    return {k for key, v in d.items() for k in (flat(v, f"{p}{key}.") if isinstance(v, dict) else [f"{p}{key}"])}

web = ROOT / "web/src/locales"
report("web", flat(json.loads((web / "en.json").read_text())), flat(json.loads((web / "es.json").read_text())))

res = ROOT / "android/app/src/main/res"
android = [{e.get("name") for e in ET.parse(res / d / "strings.xml").getroot() if e.tag in ("string", "plurals")} for d in ("values", "values-es")]
report("android", *android)

lproj = ROOT / "ios/Sources/GradesCalculator/Resources"
ios = [set(re.findall(r'^"([^"]+)"\s*=', (lproj / f"{l}.lproj/Localizable.strings").read_text(), re.M)) for l in ("en", "es")]
report("ios", *ios)
if ios[0] != android[0]:
    ok = False
    print("ios strings are out of sync with android; run scripts/sync-ios-strings.py")

sys.exit(0 if ok else 1)
