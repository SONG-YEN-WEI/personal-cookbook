"""Package the committed static app for ChatGPT Sites."""

import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = (
    "index.html",
    "app.js",
    "styles.css",
    "manifest.json",
    "sw.js",
    "icons/icon.svg",
    "icons/icon-180.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "data/recipes.json",
    "data/recipe-registry.json",
    "data/meal-sessions.json",
    "data/cooking-history.json",
)


def committed(path):
    return subprocess.check_output(["git", "show", f"HEAD:{path}"], cwd=ROOT)


def add_bytes(archive, name, content):
    info = tarfile.TarInfo(name)
    info.size = len(content)
    info.mode = 0o644
    info.mtime = 0
    archive.addfile(info, io.BytesIO(content))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/package_site.py OUTPUT.tar")
    output = Path(sys.argv[1]).resolve()
    config = committed(".openai/hosting.json")
    if json.loads(config).get("static", {}).get("directory") != "dist":
        raise SystemExit("hosting.json must declare static.directory: dist")
    with tarfile.open(output, "w") as archive:
        add_bytes(archive, ".openai/hosting.json", config)
        for path in ASSETS:
            add_bytes(archive, f"dist/{path}", committed(path))
    print(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip())
    print(output)


if __name__ == "__main__":
    main()
