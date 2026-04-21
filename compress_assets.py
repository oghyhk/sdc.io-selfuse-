"""Resize all client asset images to 512x512, in place.

- Skips safe.png (any directory).
- Preserves filenames so no code changes are needed.
- Uses high-quality Lanczos resampling.
- For PNGs, re-saves with optimize=True to compress.
"""
from pathlib import Path
from PIL import Image

ASSETS_DIR = Path(__file__).parent / "client" / "assets"
TARGET_SIZE = (512, 512)
SKIP_NAMES = {"safe.png"}
EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def process(path: Path) -> None:
    try:
        with Image.open(path) as img:
            img.load()
            fmt = img.format
            if img.size == TARGET_SIZE:
                # Still re-save PNGs with optimize to shrink file size.
                if fmt == "PNG":
                    img.save(path, format="PNG", optimize=True)
                    print(f"optimized   {path.relative_to(ASSETS_DIR)}")
                else:
                    print(f"skip (size) {path.relative_to(ASSETS_DIR)}")
                return
            mode = img.mode
            resized = img.resize(TARGET_SIZE, Image.LANCZOS)
            if fmt == "PNG":
                if mode not in ("RGBA", "RGB", "LA", "L", "P"):
                    resized = resized.convert("RGBA")
                resized.save(path, format="PNG", optimize=True)
            elif fmt in ("JPEG", "JPG"):
                if resized.mode != "RGB":
                    resized = resized.convert("RGB")
                resized.save(path, format="JPEG", quality=88, optimize=True)
            elif fmt == "WEBP":
                resized.save(path, format="WEBP", quality=88, method=6)
            else:
                resized.save(path)
            print(f"resized     {path.relative_to(ASSETS_DIR)}  ({img.size[0]}x{img.size[1]} -> 512x512)")
    except Exception as e:
        print(f"FAILED      {path.relative_to(ASSETS_DIR)}: {e}")


def main() -> None:
    if not ASSETS_DIR.is_dir():
        raise SystemExit(f"client assets dir not found: {ASSETS_DIR}")
    files = [p for p in ASSETS_DIR.rglob("*") if p.is_file() and p.suffix.lower() in EXTS]
    print(f"Found {len(files)} image(s) under {ASSETS_DIR}\n")
    for path in files:
        if path.name.lower() in SKIP_NAMES:
            print(f"skip (name) {path.relative_to(ASSETS_DIR)}")
            continue
        process(path)


if __name__ == "__main__":
    main()
