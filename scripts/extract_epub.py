#!/usr/bin/env python3
"""
extract_epub.py — Extract an EPUB file into the book/ directory.

EPUB files are ZIP archives. This script unpacks source/book.epub into book/
while preserving the original internal directory structure (META-INF/, OEBPS/, etc.)
without modifying any XHTML, images, or CSS files.

Usage:
    python3 scripts/extract_epub.py
"""

import os
import platform
import sys
import zipfile


def get_project_root():
    """Return the absolute path to the project root (photoclass-zone-system/)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    root = get_project_root()
    epub_path = os.path.join(root, "source", "book.epub")
    book_dir = os.path.join(root, "book")

    # --- Check that the EPUB exists ---
    if not os.path.isfile(epub_path):
        print(f"ERROR: EPUB file not found at: {epub_path}")
        print("Please place your EPUB file as source/book.epub and try again.")
        sys.exit(1)

    # --- Check if book/ already has content ---
    if os.path.isdir(book_dir) and os.listdir(book_dir):
        print(f"WARNING: book/ directory already exists and is not empty: {book_dir}")
        # Non-interactive mode: print warning and exit safely (no auto-overwrite)
        print("Remove or rename the existing book/ directory before extracting.")
        if platform.system() == "Windows":
            print("PowerShell:  Rename-Item book book.backup")
        else:
            print("Terminal:    mv book book.backup")
        sys.exit(1)

    # --- Ensure book/ exists ---
    os.makedirs(book_dir, exist_ok=True)

    # --- Extract the EPUB (ZIP) ---
    print(f"Extracting: {epub_path}")
    print(f"       ->  {book_dir}")
    try:
        with zipfile.ZipFile(epub_path, "r") as zf:
            zf.extractall(book_dir)
    except zipfile.BadZipFile:
        print("ERROR: The file is not a valid ZIP/EPUB archive.")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to extract EPUB: {e}")
        sys.exit(1)

    print("Extraction complete.\n")

    # --- Print useful diagnostic information ---

    # 1. META-INF/container.xml
    container_xml = os.path.join(book_dir, "META-INF", "container.xml")
    if os.path.isfile(container_xml):
        print("[OK] META-INF/container.xml exists")
        print(f"     {container_xml}")
    else:
        print("[!!] META-INF/container.xml NOT found — EPUB may be malformed")

    # 2. Locate the OPF file (referenced in container.xml)
    opf_path = find_opf(container_xml, book_dir)
    if opf_path:
        print(f"\n[OK] OPF file found: {os.path.relpath(opf_path, book_dir)}")
    else:
        print("\n[!!] OPF file NOT found")

    # 3. Check for TOC files
    toc_ncx = find_first_file(book_dir, "toc.ncx")
    nav_xhtml = find_first_file(book_dir, "nav.xhtml")

    if nav_xhtml:
        print(f"\n[OK] nav.xhtml (EPUB3 TOC) found: {os.path.relpath(nav_xhtml, book_dir)}")
    else:
        print("\n[--] nav.xhtml (EPUB3 TOC) not found")

    if toc_ncx:
        print(f"[OK] toc.ncx (EPUB2 TOC) found: {os.path.relpath(toc_ncx, book_dir)}")
    else:
        print("[--] toc.ncx (EPUB2 TOC) not found")

    if not nav_xhtml and not toc_ncx:
        print("[!!] No TOC file found — generate_units.py will fall back to scanning XHTML files")

    # 4. Count XHTML files
    xhtml_files = find_xhtml_files(book_dir)
    print(f"\n[OK] Found {len(xhtml_files)} XHTML file(s)")
    if len(xhtml_files) <= 20:
        for xf in xhtml_files:
            print(f"     {os.path.relpath(xf, book_dir)}")
    else:
        for xf in xhtml_files[:10]:
            print(f"     {os.path.relpath(xf, book_dir)}")
        print(f"     ... and {len(xhtml_files) - 10} more")

    print("\nDone. You can now run:  python3 scripts/generate_units.py")


def find_opf(container_xml_path, book_dir):
    """
    Parse META-INF/container.xml to find the OPF file path.
    Uses a simple string search to avoid adding an XML parsing dependency.
    """
    if not os.path.isfile(container_xml_path):
        return None

    try:
        with open(container_xml_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return None

    import re
    # Look for full-path="..." in <rootfile> elements
    match = re.search(r'full-path\s*=\s*["\']([^"\']+)["\']', content)
    if match:
        opf_rel = match.group(1)
        opf_abs = os.path.join(book_dir, opf_rel)
        if os.path.isfile(opf_abs):
            return opf_abs

    # Fallback: search for *.opf files
    return find_first_file(book_dir, "*.opf")


def find_first_file(directory, pattern):
    """Find the first file matching *pattern* under *directory* (recursive)."""
    import glob
    matches = glob.glob(os.path.join(directory, "**", pattern), recursive=True)
    return matches[0] if matches else None


def find_xhtml_files(directory):
    """Return a sorted list of all .xhtml and .html files under *directory*."""
    import glob
    xhtml = glob.glob(os.path.join(directory, "**", "*.xhtml"), recursive=True)
    html = glob.glob(os.path.join(directory, "**", "*.html"), recursive=True)
    return sorted(xhtml + html)


if __name__ == "__main__":
    main()
