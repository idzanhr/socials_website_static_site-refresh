#!/usr/bin/env python3
# Copyright (C) 2026 idzanhr and contributors. SPDX-License-Identifier: GPL-3.0-or-later
"""
Put brand icons (SVG) into the social links page.

  1. Save each logo as brand-icons/<slot>.svg   (e.g. brand-icons/facebook.svg)
  2. Run:  python3 tools/brand-icons.py               white logos (default)
           python3 tools/brand-icons.py --keep-colors original brand colors
  3. Upload the site-upload.zip it creates.

Each SVG is cleaned (no scripts, links, styles or embedded files) and drawn
into public/index.html, so the logo files themselves are never published.
Only Python 3 is needed; nothing to install.
"""
import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
ICONS = ROOT / "brand-icons"
UPLOAD_ZIP = ROOT / "site-upload.zip"

SVG_NS = "http://www.w3.org/2000/svg"
XLINK = "{http://www.w3.org/1999/xlink}href"

# Elements kept from the source SVG; everything else (script, style, image,
# foreignObject, metadata, editor junk …) is dropped.
KEEP = {"g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
        "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use"}
# Attributes kept. style="" is converted into these first (the site's CSP blocks inline styles).
ATTRS = {"d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height",
         "points", "transform", "fill", "fill-rule", "clip-rule", "fill-opacity", "opacity",
         "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
         "stroke-opacity", "stroke-dasharray", "offset", "stop-color", "stop-opacity",
         "gradientUnits", "gradientTransform", "fx", "fy", "spreadMethod",
         "clip-path", "mask", "maskUnits", "maskContentUnits", "clipPathUnits", "id", "href"}
PAINT = {"fill", "stroke"}
WHITE = {"#fff", "#ffffff", "white", "rgb(255,255,255)", "#fffffe", "#fefefe"}


def local(tag):
    return tag.split("}", 1)[-1]


def parse_style(text):
    out = {}
    for decl in (text or "").split(";"):
        if ":" in decl:
            k, v = decl.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def class_rules(root):
    """Collect simple `.cls-1{fill:#fff}` rules from <style> blocks (Illustrator exports)."""
    rules = {}
    for el in root.iter():
        if local(el.tag) == "style" and el.text:
            css = re.sub(r"/\*.*?\*/", "", el.text, flags=re.S)
            for sels, body in re.findall(r"([^{}]+)\{([^}]*)\}", css):
                decls = parse_style(body)
                for sel in sels.split(","):
                    sel = sel.strip()
                    if re.fullmatch(r"\.[\w-]+", sel):
                        rules.setdefault(sel[1:], {}).update(decls)
    return rules


def clean(el, slot, rules, mono, inherited_fill):
    """Return cleaned markup for element `el` (recursive)."""
    name = local(el.tag)
    if name not in KEEP:
        return ""
    attrs = {}
    for cls in (el.get("class") or "").split():
        attrs.update(rules.get(cls, {}))
    for k, v in el.attrib.items():
        k = "href" if k == XLINK else local(k)
        attrs[k] = v
    attrs.update(parse_style(el.get("style")))

    out = {}
    for k, v in attrs.items():
        if k not in ATTRS or k.startswith("on"):
            continue
        v = v.strip()
        if k == "id":
            v = f"{slot}-{v}"
        elif k == "href":
            if not v.startswith("#"):
                continue                      # no links to outside files
            v = f"#{slot}-{v[1:]}"
        else:
            v = re.sub(r"url\(\s*['\"]?#([^)'\"]+)['\"]?\s*\)", lambda m: f"url(#{slot}-{m.group(1)})", v)
        out[k] = v

    cls = None
    fill = out.get("fill", inherited_fill)
    if mono:
        for p in PAINT:
            if p in out and out[p] != "none":
                if p == "fill" and out[p].lower().replace(" ", "") in WHITE:
                    del out[p]
                    cls = "knock"             # white cut-out → takes the tile color
                else:
                    out[p] = "currentColor"
        for k in ("stop-color",):
            out.pop(k, None)
        if name in ("linearGradient", "radialGradient", "stop"):
            return ""
        fill = "currentColor" if cls != "knock" else "knock"

    children = "".join(clean(c, slot, rules, mono, fill) for c in el)
    a = "".join(f' {k}="{escape(v)}"' for k, v in out.items())
    if cls:
        a += f' class="{cls}"'
    if name in ("defs", "g", "clipPath", "mask", "linearGradient", "radialGradient") and not children:
        return ""
    return f"<{name}{a}>{children}</{name}>" if children else f"<{name}{a}/>"


def escape(v):
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def view_box(root):
    vb = root.get("viewBox")
    if vb:
        return " ".join(vb.replace(",", " ").split())
    w = re.sub(r"[^\d.]", "", root.get("width", "24")) or "24"
    h = re.sub(r"[^\d.]", "", root.get("height", "24")) or "24"
    return f"0 0 {w} {h}"


def convert(path, mono):
    slot = re.sub(r"[^a-z0-9]", "", path.stem.lower())
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        raise SystemExit(f"  ✗ {path.name}: not a valid SVG ({e})")
    if local(root.tag) != "svg":
        raise SystemExit(f"  ✗ {path.name}: not an SVG file")
    rules = class_rules(root)
    body = "".join(clean(c, slot, rules, mono, root.get("fill")) for c in root)
    if not body:
        raise SystemExit(f"  ✗ {path.name}: no shapes found (is it a PNG inside an SVG?)")
    attrs = ""
    if not mono and root.get("fill"):
        attrs = f' fill="{escape(root.get("fill"))}"'
    return slot, f'<symbol id="b-{slot}" viewBox="{view_box(root)}"{attrs}>{body}</symbol>'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep-colors", action="store_true", help="keep the logos' own colors instead of white")
    ap.add_argument("--no-zip", action="store_true", help="don't create site-upload.zip")
    args = ap.parse_args()

    html = INDEX.read_text(encoding="utf-8")
    start, end = "<!-- brand-icons", "<!-- /brand-icons -->"
    if start not in html or end not in html:
        sys.exit("public/index.html has no brand-icons block. Use the index.html from the zip.")

    files = sorted(p for p in ICONS.glob("*.svg"))
    if not files:
        print("No SVGs in brand-icons/ — nothing to do. Slot names are listed in README.md.")

    # Keep license/attribution comments (Font Awesome Free's CC BY 4.0 requires it)
    credits = []
    for f in files:
        for c in re.findall(r"<!--!?\s*(.*?)\s*-->", f.read_text(encoding="utf-8", errors="replace"), re.S):
            if re.search(r"licen[cs]e|copyright|cc by|font awesome", c, re.I):
                c = " ".join(c.replace("--", "-").split())
                if c not in credits:
                    credits.append(c)
    html = re.sub(r"    <!-- credits: .*? -->\n", "", html)
    if credits:
        block = "".join(f"    <!-- credits: {c} -->\n" for c in credits)
        html = html.replace(f"    {end}", f"{block}    {end}", 1)

    done = []
    for f in files:
        slot, symbol = convert(f, mono=not args.keep_colors)
        pattern = re.compile(rf'    <symbol id="b-{slot}"[^>]*>.*?</symbol>\n', re.S)
        line = f"    {symbol}\n"
        if pattern.search(html):
            html = pattern.sub(lambda m: line, html, count=1)
        else:
            html = html.replace(f"    {end}", f"{line}    {end}", 1)
            print(f"  + new slot b-{slot}: use it in a link with <use href=\"#b-{slot}\"/>")
        # this slot now has a real logo → drop the placeholder styling on its links
        html = re.sub(rf'class="ico ico-brand has-placeholder"( aria-hidden="true"><use href="#b-{slot}"/>)',
                      r'class="ico ico-brand"\1', html)
        done.append(slot)
        print(f"  ✓ {f.name} → b-{slot}")

    INDEX.write_text(html, encoding="utf-8")
    left = sorted(set(re.findall(r'has-placeholder" aria-hidden="true"><use href="#b-(\w+)"', html)))
    print(f"\n{len(done)} logo(s) added ({'own colors' if args.keep_colors else 'white'}).")
    if left:
        print("Still generic: " + ", ".join(left))

    if not args.no_zip:
        with zipfile.ZipFile(UPLOAD_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(PUBLIC.rglob("*")):
                if p.is_file() and p.name != ".keep":
                    z.write(p, p.relative_to(PUBLIC).as_posix())
        print(f"Ready to upload: {UPLOAD_ZIP.name}")


if __name__ == "__main__":
    main()
