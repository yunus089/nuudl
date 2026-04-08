from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image


REPO_ROOT = Path(r"C:\Users\yunus\Desktop\OJ_neu")
SOURCE_ROOT = Path(r"C:\Users\yunus\Desktop\OJ_Codex")
OUTPUT_ROOT = REPO_ROOT / "apps" / "consumer" / "public" / "brand" / "nuudl" / "png"

BRANDKIT_PATH = SOURCE_ROOT / "Brandkit.jpg"


def average_corner_color(image: Image.Image, patch_size: int = 12) -> tuple[int, int, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    patches = [
        (0, 0, patch_size, patch_size),
        (width - patch_size, 0, width, patch_size),
        (0, height - patch_size, patch_size, height),
        (width - patch_size, height - patch_size, width, height),
    ]
    pixels: list[tuple[int, int, int]] = []
    for box in patches:
        patch = rgba.crop(box)
        pixels.extend([(r, g, b) for r, g, b, _ in patch.getdata()])
    red = round(sum(pixel[0] for pixel in pixels) / len(pixels))
    green = round(sum(pixel[1] for pixel in pixels) / len(pixels))
    blue = round(sum(pixel[2] for pixel in pixels) / len(pixels))
    return red, green, blue


def remove_background(
    image: Image.Image,
    *,
    mode: str,
    tolerance: int = 36,
) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())

    if mode == "white":
        converted = [
            (r, g, b, 0) if r >= 238 and g >= 238 and b >= 238 else (r, g, b, a)
            for r, g, b, a in pixels
        ]
    elif mode == "corner":
        ref_r, ref_g, ref_b = average_corner_color(rgba)
        converted = []
        for r, g, b, a in pixels:
            distance = abs(r - ref_r) + abs(g - ref_g) + abs(b - ref_b)
            if distance <= tolerance:
                converted.append((r, g, b, 0))
            else:
                converted.append((r, g, b, a))
    else:
        raise ValueError(f"Unsupported background mode: {mode}")

    rgba.putdata(converted)
    return trim_transparent_edges(rgba)


def trim_transparent_edges(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
      return image
    return image.crop(bbox)


def save_png(image: Image.Image, name: str, *, width: int | None = None) -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT_ROOT / name
    final_image = image
    if width is not None and final_image.width != width:
        ratio = width / final_image.width
        height = max(1, round(final_image.height * ratio))
        final_image = final_image.resize((width, height), Image.Resampling.LANCZOS)
    final_image.save(target, format="PNG")


def crop(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return image.crop(box)


def main() -> None:
    brandkit = Image.open(BRANDKIT_PATH).convert("RGBA")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for stale_name in ("neon-logo.png",):
        stale_target = OUTPUT_ROOT / stale_name
        if stale_target.exists():
            stale_target.unlink()

    entries: Iterable[tuple[str, tuple[int, int, int, int], str | None, int | None]] = [
        ("primary-logo.png", (40, 24, 505, 455), "corner", 680),
        ("secondary-logo-inverse.png", (492, 36, 1028, 412), "corner", 760),
        ("logo-horizontal-inverse.png", (492, 36, 1028, 412), "corner", 760),
        ("icon-only-inverse.png", (1034, 28, 1506, 425), "corner", 520),
        ("icon-inverse.png", (1034, 28, 1506, 425), "corner", 520),
        ("wordmark-only-inverse.png", (1512, 42, 2028, 420), "corner", 760),
        ("wordmark-inverse.png", (1512, 42, 2028, 420), "corner", 760),
        ("primary-logo-purple.png", (38, 528, 516, 1000), "white", 680),
        ("secondary-logo.png", (500, 546, 1060, 940), "white", 760),
        ("logo-horizontal.png", (500, 546, 1060, 940), "white", 760),
        ("icon-only.png", (1048, 536, 1512, 948), "white", 520),
        ("icon.png", (1048, 536, 1512, 948), "white", 520),
        ("wordmark-only.png", (1508, 558, 2024, 936), "white", 760),
        ("wordmark.png", (1508, 558, 2024, 936), "white", 760),
        ("hero-logo.png", (388, 1050, 1668, 1432), "white", 1180),
        ("logo-horizontal-wide.png", (92, 1490, 936, 1930), "white", 900),
        ("logo-stacked.png", (786, 1444, 1298, 1984), "white", 700),
        ("app-icon.png", (1270, 1432, 1650, 1906), "white", 512),
        ("small-size.png", (1730, 1438, 2038, 1906), "white", 280),
    ]

    for filename, box, bg_mode, width in entries:
        image = crop(brandkit, box)
        if bg_mode:
            image = remove_background(image, mode=bg_mode)
        save_png(image, filename, width=width)

    app_icon = remove_background(crop(brandkit, (1270, 1432, 1650, 1906)), mode="white")
    save_png(app_icon, "app-icon-square.png", width=1024)


if __name__ == "__main__":
    main()
