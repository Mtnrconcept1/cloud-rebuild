from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "iconeapp.png"
APPICON_DIR = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset"
DEFAULT_ICON = APPICON_DIR / "AppIcon-512@2x.png"
DARK_ICON = APPICON_DIR / "AppIcon-512@2x-dark.png"
TINTED_ICON = APPICON_DIR / "AppIcon-512@2x-tinted.png"
CONTENTS = APPICON_DIR / "Contents.json"
SIZE = 1024


def crop_visible(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("TOK source logo has no visible pixels")
    return rgba.crop(bbox)


def fit_logo(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    fitted = ImageOps.contain(image, (max_width, max_height), Image.Resampling.LANCZOS)
    # The source is 512 px. A light unsharp pass preserves edge clarity after the 2x upscale.
    return fitted.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=2))


def center(canvas: Image.Image, logo: Image.Image) -> None:
    x = (canvas.width - logo.width) // 2
    y = (canvas.height - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))


APPICON_DIR.mkdir(parents=True, exist_ok=True)
source = crop_visible(Image.open(SOURCE))

# Default / Any appearance: fully opaque, warm off-white background, no black padding.
default_canvas = Image.new("RGBA", (SIZE, SIZE), (255, 249, 244, 255))
default_logo = fit_logo(source, 900, 920)
center(default_canvas, default_logo)
default_canvas.convert("RGB").save(DEFAULT_ICON, format="PNG", optimize=True)

# Dark appearance: Apple recommends a transparent background so the system backdrop can show through.
# The TOK emblem itself fills the canvas, so the system backdrop cannot dominate visually.
dark_canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
dark_logo = fit_logo(source, 940, 960)
center(dark_canvas, dark_logo)
dark_canvas.save(DARK_ICON, format="PNG", optimize=True)

# Tinted appearance: grayscale source with preserved alpha, as required for the system tint treatment.
tinted_source = source.copy()
gray = ImageOps.grayscale(tinted_source)
gray = ImageOps.autocontrast(gray)
gray = ImageEnhance.Contrast(gray).enhance(1.08)
tinted_source = Image.merge("RGBA", (gray, gray, gray, tinted_source.getchannel("A")))
tinted_canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
tinted_logo = fit_logo(tinted_source, 940, 960)
center(tinted_canvas, tinted_logo)
tinted_canvas.save(TINTED_ICON, format="PNG", optimize=True)

contents = {
    "images": [
        {
            "filename": DEFAULT_ICON.name,
            "idiom": "universal",
            "platform": "ios",
            "size": "1024x1024",
        },
        {
            "appearances": [{"appearance": "luminosity", "value": "dark"}],
            "filename": DARK_ICON.name,
            "idiom": "universal",
            "platform": "ios",
            "size": "1024x1024",
        },
        {
            "appearances": [{"appearance": "luminosity", "value": "tinted"}],
            "filename": TINTED_ICON.name,
            "idiom": "universal",
            "platform": "ios",
            "size": "1024x1024",
        },
    ],
    "info": {"author": "xcode", "version": 1},
}
CONTENTS.write_text(json.dumps(contents, indent=2) + "\n", encoding="utf-8")

for icon_path in (DEFAULT_ICON, DARK_ICON, TINTED_ICON):
    image = Image.open(icon_path)
    if image.size != (SIZE, SIZE):
        raise RuntimeError(f"{icon_path.name} has invalid size {image.size}")

if Image.open(DEFAULT_ICON).mode != "RGB":
    raise RuntimeError("Default App Store icon must be fully opaque RGB")

print("Generated TOK iOS app icon variants:")
print(f"- default: {DEFAULT_ICON}")
print(f"- dark: {DARK_ICON}")
print(f"- tinted: {TINTED_ICON}")
