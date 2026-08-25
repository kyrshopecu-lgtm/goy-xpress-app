#!/usr/bin/env python3
import re
import sys
import xml.etree.ElementTree as ET


def main() -> int:
    if len(sys.argv) != 3:
        print("Uso: ui_point.py ARCHIVO_XML TEXTO", file=sys.stderr)
        return 2

    xml_path, needle = sys.argv[1], sys.argv[2]
    needle = needle.casefold()

    try:
        root = ET.parse(xml_path).getroot()
    except (ET.ParseError, OSError):
        return 1

    for node in root.iter("node"):
        searchable = " ".join(
            node.attrib.get(name, "")
            for name in ("text", "content-desc", "resource-id")
        ).casefold()
        if needle not in searchable:
            continue

        match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if not match:
            continue

        left, top, right, bottom = map(int, match.groups())
        print(f"{(left + right) // 2} {(top + bottom) // 2}")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
