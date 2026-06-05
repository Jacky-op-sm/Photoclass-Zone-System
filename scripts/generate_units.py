#!/usr/bin/env python3
"""
generate_units.py — Generate data/units.json from the EPUB's table of contents.

Parses toc.ncx (EPUB2) or nav.xhtml (EPUB3) to extract chapter structure.
Each core chapter becomes a Unit with reading checkpoints derived from
its subsections. Appendices are treated as reference units.

Usage:
    python3 scripts/generate_units.py
"""

import os
import sys
import json
import xml.etree.ElementTree as ET
import re


def get_project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── NCX namespace ────────────────────────────────────────────────────
NCX_NS = "http://www.daisy.org/z3986/2005/ncx/"


def parse_ncx(ncx_path):
    """
    Parse toc.ncx and return a flat list of (label, src, children) tuples.
    The NCX has a flat <navMap> with explicit nesting via
    <navPoint> containing child <navPoint> elements.
    """
    tree = ET.parse(ncx_path)
    root = tree.getroot()

    ns = {"ncx": NCX_NS}
    nav_map = root.find("ncx:navMap", ns)
    if nav_map is None:
        print("ERROR: No <navMap> found in toc.ncx")
        sys.exit(1)

    entries = []
    for np in nav_map.findall("ncx:navPoint", ns):
        entries.append(_parse_nav_point(np, ns))
    return entries


def _parse_nav_point(np_elem, ns):
    """Recursively parse a <navPoint> element."""
    label_el = np_elem.find("ncx:navLabel/ncx:text", ns)
    content_el = np_elem.find("ncx:content", ns)
    label = label_el.text.strip() if label_el is not None and label_el.text else ""
    src = content_el.get("src", "") if content_el is not None else ""

    # Parent section href: strip any fragment (#...) to get the parent file
    parent_href = src.split("#")[0] if src else ""

    children = []
    for child_np in np_elem.findall("ncx:navPoint", ns):
        children.append(_parse_nav_point(child_np, ns))

    return {
        "label": label,
        "src": src,
        "href": parent_href,
        "children": children,
    }


# ── Unit builder ─────────────────────────────────────────────────────

# Known patterns for core chapters
CHAPTER_PATTERN = re.compile(r"Chapter\s+\d+", re.IGNORECASE)

# Reflection prompts for all units
REFLECTION_PROMPTS = {
    "coreIdeas": "本章最重要的 3–5 个概念是什么？",
    "myUnderstanding": "我如何用自己的话理解这些概念？",
    "bwRelevance": "它对我的黑白摄影有什么帮助？",
    "questions": "我还有哪些不清楚的地方？",
    "nextPractice": "下一次拍摄或后期时，我要尝试什么？",
}

# Priority mapping based on chapter importance for B&W photography
PRIORITY_MAP = {
    "Why and How": "high",
    "Chapter 1": "medium",
    "Chapter 2": "medium",
    "Chapter 3": "medium",
    "Chapter 4": "high",
    "Chapter 5": "high",
    "Chapter 6": "medium",
    "Chapter 7": "medium",
    "Chapter 8": "medium",
    "Chapter 9": "low",
    "Chapter 10": "high",
    "Chapter 11": "medium",
}

# Estimated study days
ESTIMATED_DAYS_MAP = {
    "Why and How": 1,
    "Chapter 1": 3,
    "Chapter 2": 4,
    "Chapter 3": 3,
    "Chapter 4": 4,
    "Chapter 5": 5,
    "Chapter 6": 4,
    "Chapter 7": 2,
    "Chapter 8": 4,
    "Chapter 9": 3,
    "Chapter 10": 6,
    "Chapter 11": 4,
}


def build_units(entries):
    """
    Convert parsed NCX entries into study units.
    Returns a list of unit dicts.
    """
    units = []
    unit_number = 0  # will increment for core units

    for entry in entries:
        label = entry["label"]
        href = entry["href"]
        children = entry["children"]

        # ── Skip front matter ──
        if _is_front_matter(label):
            continue

        # ── Determine unit type ──
        is_appendix = _is_appendix(label)
        is_chapter = CHAPTER_PATTERN.search(label) is not None
        is_intro = "Why and How" in label or "Read this Book" in label

        if is_intro or is_chapter:
            unit_number += 1
            unit_type = "core"
            unit_id = f"unit-{unit_number:02d}"
            priority = _get_priority(label)
            estimated_days = _get_estimated_days(label)
            title = _clean_title(label)
        elif is_appendix:
            unit_type = "reference"
            unit_id = f"ref-{_slugify(label)}"
            priority = "reference"
            estimated_days = 1
            title = _clean_title(label)
            if title.startswith("Appendix "):
                # e.g. "Appendix A Color Management..." → "Appendix A"
                short = title.split(" ", 2)
                if len(short) >= 2:
                    title = f"{short[0]} {short[1]}: {short[2]}" if len(short) > 2 else title
        else:
            # Skip index and other non-chapter entries
            continue

        # ── Build checkpoints ──
        checkpoints = []
        if children:
            for i, child in enumerate(children):
                cp_id = f"{unit_id}-checkpoint-{(i+1):02d}"
                cp_href = _make_book_path(child["src"])
                checkpoints.append({
                    "id": cp_id,
                    "title": child["label"],
                    "href": cp_href,
                })
        else:
            # No subsections — create a single default checkpoint
            cp_id = f"{unit_id}-checkpoint-01"
            checkpoints.append({
                "id": cp_id,
                "title": title,
                "href": _make_book_path(entry["src"]),
            })

        # ── Build unit ──
        unit = {
            "id": unit_id,
            "number": unit_number if unit_type == "core" else None,
            "title": title,
            "type": unit_type,
            "href": _make_book_path(entry["src"]),
            "estimatedDays": estimated_days,
            "priority": priority,
            "checkpoints": checkpoints,
            "reflectionPrompts": REFLECTION_PROMPTS,
        }
        units.append(unit)

    # For reference units, assign sequential numbers within reference group
    ref_idx = 0
    for u in units:
        if u["type"] == "reference":
            ref_idx += 1
            u["number"] = ref_idx  # display number for reference units

    return units


def _is_front_matter(label):
    fm = [
        "Cover", "Half Title", "Title", "Copyright", "Contents",
        "Preface", "Acknowledgments", "Index",
    ]
    for f in fm:
        if label.startswith(f):
            return True
    return False


def _is_appendix(label):
    return label.startswith("Appendix") or label == "Appendices"


def _clean_title(label):
    """Remove HTML entities and long chapter prefixes."""
    # Decode numeric entities
    title = label.replace("&#x201C;", "\u201c").replace("&#x201D;", "\u201d")
    title = title.replace("&#x2019;", "\u2019").replace("&#x2018;", "\u2018")
    title = title.replace("&#x2014;", "\u2014")
    # Remove the "Chapter N " prefix for cleaner display
    title = re.sub(r"^Chapter\s+\d+\s+", "", title)
    # Remove smart quotes from title
    title = title.replace("\u201c", "").replace("\u201d", "")
    return title.strip()


def _get_priority(label):
    for key, pri in PRIORITY_MAP.items():
        if key in label:
            return pri
    return "medium"


def _get_estimated_days(label):
    for key, days in ESTIMATED_DAYS_MAP.items():
        if key in label:
            return days
    # Default
    return 3


def _slugify(text):
    """Create a simple slug from text."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _make_book_path(src):
    """
    Convert NCX-relative path (e.g. 'xhtml/Ch04.xhtml#sec4_1')
    to a path relative to photoclass-zone-system/ root
    (e.g. 'book/OEBPS/xhtml/Ch04.xhtml#sec4_1').
    """
    if not src:
        return ""
    return f"book/OEBPS/{src}"


# ── Entry point ──────────────────────────────────────────────────────

def main():
    root = get_project_root()
    ncx_path = os.path.join(root, "book", "OEBPS", "toc.ncx")
    out_path = os.path.join(root, "data", "units.json")

    if not os.path.isfile(ncx_path):
        print(f"ERROR: toc.ncx not found at {ncx_path}")
        print("Run scripts/extract_epub.py first.")
        sys.exit(1)

    print(f"Parsing: {ncx_path}")
    entries = parse_ncx(ncx_path)
    print(f"  Found {len(entries)} top-level TOC entries")

    units = build_units(entries)

    core_units = [u for u in units if u["type"] == "core"]
    ref_units = [u for u in units if u["type"] == "reference"]

    total_checkpoints = sum(len(u["checkpoints"]) for u in core_units)

    print(f"\nGenerated units:")
    print(f"  Core units:      {len(core_units)}")
    for u in core_units:
        print(f"    Unit {u['number']:2d}: {u['title']}  ({len(u['checkpoints'])} checkpoints)")

    print(f"  Reference units: {len(ref_units)}")
    for u in ref_units:
        print(f"    {u['id']}: {u['title']}  ({len(u['checkpoints'])} checkpoints)")

    print(f"\n  Total core checkpoints: {total_checkpoints}")

    # Write output
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(units, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] Written to: {out_path}")
    print("You can now manually adjust estimatedDays, priority, or checkpoints if needed.")
    print("Then run:  python3 scripts/serve.py --open")


if __name__ == "__main__":
    main()
