#!/usr/bin/env python3
import json
import os
import re
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

LINGUALID_URL = "https://lingualid.com/top-200-common-verbs-in-spanish/"
FREEDICT_URL = "https://download.freedict.org/generated/cat-spa/tei/freedict-cat-spa.tei.gz"

TENSE_MAP = {
    "present": "present",
    "imperfect": "imperfet",
    "future": "futur",
    "conditional": "condicional",
}

PERSONS = ["jo", "tu", "ell", "nosaltres", "vosaltres", "ells"]

PRONOUN_PREFIX = {
    "jo": "jo ",
    "tu": "tu ",
    "ell": "ell ",
    "nosaltres": "nosaltres ",
    "vosaltres": "vosaltres ",
    "ells": "ells ",
}


class LingualidParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_td = False
        self.current_row = []
        self.rows = []
        self.buffer = []

    def handle_starttag(self, tag, attrs):
        if tag == "td":
            self.in_td = True
            self.buffer = []

    def handle_endtag(self, tag):
        if tag == "td":
            self.in_td = False
            text = "".join(self.buffer).strip()
            self.current_row.append(re.sub(r"\s+", " ", text))
            self.buffer = []
        if tag == "tr" and self.current_row:
            self.rows.append(self.current_row)
            self.current_row = []

    def handle_data(self, data):
        if self.in_td:
            self.buffer.append(data)


def fetch_text(url):
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8", errors="ignore")


def download_file(url, dest_path):
    with urllib.request.urlopen(url) as response, open(dest_path, "wb") as out:
        out.write(response.read())


def parse_lingualid(html):
    parser = LingualidParser()
    parser.feed(html)
    results = []
    for row in parser.rows:
        if len(row) < 3:
            continue
        rank, spanish, english = row[0:3]
        spanish = spanish.strip().lower()
        english = english.strip().lower()
        if not spanish or not english:
            continue
        results.append({"spanish": spanish, "english": english})
    # Deduplicate while keeping order
    seen = set()
    cleaned = []
    for item in results:
        key = item["spanish"]
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(item)
    return cleaned


def normalize_word(word):
    return re.sub(r"\s+", " ", word.strip().lower())


def is_verb_like(word):
    return word.endswith("ar") or word.endswith("er") or word.endswith("ir") or word.endswith("re")


def is_reflexive(word):
    return word.endswith("se") or "-se" in word


def build_spanish_to_catalan_map(tei_path):
    mapping = {}
    for event, elem in ET.iterparse(tei_path, events=("end",)):
        if not elem.tag.endswith("entry"):
            continue
        cat = None
        for orth in elem.iter():
            if orth.tag.endswith("orth") and orth.text:
                cat = normalize_word(orth.text)
                break
        if not cat or not is_verb_like(cat) or is_reflexive(cat):
            elem.clear()
            continue
        for quote in elem.iter():
            if quote.tag.endswith("quote") and quote.text:
                spa = normalize_word(quote.text)
                if not spa or not is_verb_like(spa) or is_reflexive(spa):
                    continue
                if spa not in mapping:
                    mapping[spa] = cat
        elem.clear()
    return mapping


def strip_pronoun(form, person):
    if not form:
        return ""
    value = form.strip()
    prefix = PRONOUN_PREFIX.get(person)
    if prefix and value.lower().startswith(prefix):
        return value[len(prefix) :].strip()
    return value


def regular_present(infinitive, group, person):
    stem = infinitive[:-2]
    if group == "ar":
        return {
            "jo": f"{stem}o",
            "tu": f"{stem}es",
            "ell": f"{stem}a",
            "nosaltres": f"{stem}em",
            "vosaltres": f"{stem}eu",
            "ells": f"{stem}en",
        }.get(person, "")
    if group == "ir":
        return {
            "jo": f"{stem}o",
            "tu": f"{stem}s",
            "ell": f"{stem}",
            "nosaltres": f"{stem}im",
            "vosaltres": f"{stem}iu",
            "ells": f"{stem}en",
        }.get(person, "")
    return {
        "jo": f"{stem}o",
        "tu": f"{stem}s",
        "ell": f"{stem}",
        "nosaltres": f"{stem}em",
        "vosaltres": f"{stem}eu",
        "ells": f"{stem}en",
    }.get(person, "")


def regular_imperfect(infinitive, group, person):
    stem = infinitive[:-2]
    if group == "ar":
        return {
            "jo": f"{stem}ava",
            "tu": f"{stem}aves",
            "ell": f"{stem}ava",
            "nosaltres": f"{stem}àvem",
            "vosaltres": f"{stem}àveu",
            "ells": f"{stem}aven",
        }.get(person, "")
    return {
        "jo": f"{stem}ia",
        "tu": f"{stem}ies",
        "ell": f"{stem}ia",
        "nosaltres": f"{stem}íem",
        "vosaltres": f"{stem}íeu",
        "ells": f"{stem}ien",
    }.get(person, "")


def regular_future(infinitive, person):
    return {
        "jo": f"{infinitive}é",
        "tu": f"{infinitive}às",
        "ell": f"{infinitive}à",
        "nosaltres": f"{infinitive}em",
        "vosaltres": f"{infinitive}eu",
        "ells": f"{infinitive}an",
    }.get(person, "")


def regular_conditional(infinitive, person):
    return {
        "jo": f"{infinitive}ia",
        "tu": f"{infinitive}ies",
        "ell": f"{infinitive}ia",
        "nosaltres": f"{infinitive}íem",
        "vosaltres": f"{infinitive}íeu",
        "ells": f"{infinitive}ien",
    }.get(person, "")


def expected_regular(infinitive, group):
    return {
        "present": {p: regular_present(infinitive, group, p) for p in PERSONS},
        "imperfect": {p: regular_imperfect(infinitive, group, p) for p in PERSONS},
        "future": {p: regular_future(infinitive, p) for p in PERSONS},
        "conditional": {p: regular_conditional(infinitive, p) for p in PERSONS},
    }


def get_group(infinitive):
    if infinitive.endswith("ar"):
        return "ar"
    if infinitive.endswith("ir"):
        return "ir"
    return "er"


def main():
    try:
        from verbecc import Conjugator, LangCodeISO639_1
    except ImportError:
        print("Missing dependency: verbecc. Install with: pip install verbecc")
        sys.exit(1)

    output_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "src", "data", "verbs.json"
    )

    print("Fetching Lingualid list...")
    lingualid_html = fetch_text(LINGUALID_URL)
    spanish_list = parse_lingualid(lingualid_html)

    print("Downloading FreeDict (cat-spa)...")
    with tempfile.TemporaryDirectory() as tmpdir:
        gz_path = os.path.join(tmpdir, "cat-spa.tei.gz")
        tei_path = os.path.join(tmpdir, "cat-spa.tei")
        download_file(FREEDICT_URL, gz_path)

        import gzip

        with gzip.open(gz_path, "rb") as gz_file, open(tei_path, "wb") as out:
            out.write(gz_file.read())

        print("Building Spanish->Catalan map...")
        spa_to_cat = build_spanish_to_catalan_map(tei_path)

    print("Mapping Spanish list to Catalan...")
    mapped = []
    missing = []
    for item in spanish_list:
        spa = normalize_word(item["spanish"])
        if is_reflexive(spa):
            continue
        cat = spa_to_cat.get(spa)
        if not cat:
            missing.append(spa)
            continue
        mapped.append({"infinitive": cat, "translation": item["english"]})

    # Deduplicate Catalan entries
    seen = set()
    unique = []
    for item in mapped:
        if item["infinitive"] in seen:
            continue
        seen.add(item["infinitive"])
        unique.append(item)

    print(f"Mapped {len(unique)} verbs. Missing: {len(missing)}")

    conj = Conjugator(lang=LangCodeISO639_1.ca)
    output = []

    for item in unique:
        infinitive = item["infinitive"]
        if not is_verb_like(infinitive) or is_reflexive(infinitive):
            continue
        conjugation = conj.conjugate(infinitive)
        moods = conjugation.get("moods", {})
        indicatiu = moods.get("Indicatiu") or moods.get("indicatiu") or {}

        tenses = {}
        for out_tense, verb_tense in TENSE_MAP.items():
            forms = indicatiu.get(verb_tense)
            if not forms:
                break
            tenses[out_tense] = {
                "jo": strip_pronoun(forms[0], "jo"),
                "tu": strip_pronoun(forms[1], "tu"),
                "ell": strip_pronoun(forms[2], "ell"),
                "nosaltres": strip_pronoun(forms[3], "nosaltres"),
                "vosaltres": strip_pronoun(forms[4], "vosaltres"),
                "ells": strip_pronoun(forms[5], "ells"),
            }

        if len(tenses) != len(TENSE_MAP):
            continue

        group = get_group(infinitive)
        regular_expected = expected_regular(infinitive, group)
        is_regular = True
        for tense_key in TENSE_MAP.keys():
            for person in PERSONS:
                if tenses[tense_key][person] != regular_expected[tense_key][person]:
                    is_regular = False
                    break
            if not is_regular:
                break

        output.append(
            {
                "infinitive": infinitive,
                "translation": item["translation"],
                "regular": is_regular,
                "group": group,
                "tenses": tenses,
            }
        )

    output.sort(key=lambda v: v["infinitive"])

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(output)} verbs to {output_path}.")


if __name__ == "__main__":
    main()
