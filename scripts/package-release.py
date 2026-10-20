"""Build and verify the three-file Obsidian release and manual-install ZIP."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text())
package = json.loads((root / "package.json").read_text())
version = manifest["version"]
assert re.fullmatch(r"\d+\.\d+\.\d+", version), "Use an x.y.z version"
assert package["version"] == version, "Package and manifest versions differ"
assert manifest["author"] == "williambooth0803-ui", "Missing publisher"
assert manifest["isDesktopOnly"] is True
assert json.loads((root / "versions.json").read_text())[version] == manifest["minAppVersion"]
assert "MIT License" in (root / "LICENSE").read_text()
assert "require('./review-schema.json')" not in (root / "main.js").read_text()
names = ["main.js", "manifest.json", "styles.css"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
for existing in dist.iterdir():
    if existing.is_file():
        existing.unlink()
for name in names:
    shutil.copyfile(root / name, dist / name)
archive = dist / f'{manifest["id"]}-{version}.zip'
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as out:
    for name in names:
        info = zipfile.ZipInfo(f'{manifest["id"]}/{name}', date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        out.writestr(info, (dist / name).read_bytes())
with zipfile.ZipFile(archive) as check:
    assert sorted(check.namelist()) == sorted(f'{manifest["id"]}/{name}' for name in names)
    for name in names:
        assert check.read(f'{manifest["id"]}/{name}') == (root / name).read_bytes()
checksums = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}
assert json.loads((root / "runtime-checksums.json").read_text()) == checksums, "Refresh runtime-checksums.json"
checksums[archive.name] = hashlib.sha256(archive.read_bytes()).hexdigest()
(dist / "checksums.sha256").write_text("".join(f"{digest}  {name}\n" for name, digest in checksums.items()))
print(f"Verified {version}: three runtime files, manual ZIP, SHA-256 checksums.")
