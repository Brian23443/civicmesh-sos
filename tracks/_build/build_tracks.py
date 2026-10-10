"""Assemble tracks/TRACK_*.md from the templates in this folder.

Each template may contain:
  {{COMMON}}      -> contents of common.md (team structure, contracts, sync points, git workflow)
  {{SPEC:<key>}}  -> a section of MASTER_PROMPT.md, copied verbatim

Run from the repo root after editing a template or MASTER_PROMPT.md:
    python3 tracks/_build/build_tracks.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = Path(__file__).resolve().parent
MASTER = ROOT / "MASTER_PROMPT.md"

# key -> (heading prefix that must start the section, heading level)
# A section runs until the next heading of the same or higher level, or a '---' rule.
SECTIONS = {
    "0": ("## 0. ", 2),
    "1": ("## 1. ", 2),
    "2": ("## 2. ", 2),
    "3": ("## 3. ", 2),
    "4": ("## 4. ", 2),
    "5": ("## 5. ", 2),
    "5.0": ("### 5.0 ", 3),
    "5.3": ("### 5.3 ", 3),
    "5.4": ("### 5.4 ", 3),
    "6": ("## 6. ", 2),
    "7": ("## 7. ", 2),
    "8": ("## 8. ", 2),
    "9": ("## 9. ", 2),
    "10": ("## 10. ", 2),
    "11": ("## 11. ", 2),
    "12": ("## 12. ", 2),
    "12.1": ("### 12.1 ", 3),
    "12.3": ("### 12.3 ", 3),
    "13.1": ("### 13.1 ", 3),
    "13.2": ("### 13.2 ", 3),
    "13.3": ("### 13.3 ", 3),
    "13.4": ("### 13.4 ", 3),
    "13.5": ("### 13.5 ", 3),
    "14": ("## 14. ", 2),
    "15": ("## 15. ", 2),
    "16": ("## 16. ", 2),
    "A": ("## Appendix A ", 2),
    "B": ("## Appendix B ", 2),
    "C": ("## Appendix C ", 2),
}

HEADING = re.compile(r"^(#{1,6}) ")


def extract(lines: list[str], prefix: str, level: int) -> str:
    starts = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if len(starts) != 1:
        raise SystemExit(f"expected exactly one heading starting with {prefix!r}, found {len(starts)}")
    start = starts[0]
    fence = ""  # the backtick run that opened the current code fence ("" = not in a fence)
    end = len(lines)
    for i in range(start + 1, len(lines)):
        line = lines[i]
        run = re.match(r"^(`{3,})", line)
        if run:
            if not fence:
                fence = run.group(1)
            elif line.strip() == fence:
                fence = ""
            continue
        if fence:
            continue
        m = HEADING.match(line)
        if line.strip() == "---" or (m and len(m.group(1)) <= level):
            end = i
            break
    return "\n".join(lines[start:end]).rstrip() + "\n"


def main() -> None:
    lines = MASTER.read_text().splitlines()
    common = (BUILD / "common.md").read_text().rstrip() + "\n"
    for n in range(1, 5):
        tpl = (BUILD / f"T{n}.md").read_text()
        out = tpl.replace("{{COMMON}}", common)

        def sub(m: re.Match) -> str:
            key = m.group(1)
            if key not in SECTIONS:
                raise SystemExit(f"T{n}.md: unknown section key {key!r}")
            return extract(lines, *SECTIONS[key]).rstrip()

        out = re.sub(r"\{\{SPEC:([\w.]+)\}\}", sub, out)
        if "{{" in out:
            raise SystemExit(f"T{n}.md: unresolved placeholder")
        names = {1: "CORE_MODEL", 2: "HARDWARE_BRIDGE", 3: "DASHBOARD_DATA", 4: "SURVIVOR_PWA"}
        dest = ROOT / "tracks" / f"TRACK_{n}_{names[n]}.md"
        dest.write_text(out)
        print(f"{dest.relative_to(ROOT)}: {len(out.splitlines())} lines, {len(out) // 1024} KB")


if __name__ == "__main__":
    main()
