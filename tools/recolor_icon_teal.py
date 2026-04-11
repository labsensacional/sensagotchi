#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


BG_MAX = 24
PALETTE = [
    (0.00, (28, 105, 112)),   # TEAL_DEEP
    (0.38, (45, 148, 155)),   # TEAL_DARK
    (0.68, (72, 185, 185)),   # TEAL
    (1.00, (155, 225, 220)),  # TEAL_LIGHT
]


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def sample_gradient(t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    for idx in range(len(PALETTE) - 1):
        left_t, left_rgb = PALETTE[idx]
        right_t, right_rgb = PALETTE[idx + 1]
        if t <= right_t:
            local_t = 0.0 if right_t == left_t else (t - left_t) / (right_t - left_t)
            local_t = smoothstep(local_t)
            return tuple(
                round(left_rgb[ch] + (right_rgb[ch] - left_rgb[ch]) * local_t)
                for ch in range(3)
            )
    return PALETTE[-1][1]


def recolor(path: Path) -> None:
    img = Image.open(path).convert("RGBA")
    px = img.load()
    width, height = img.size

    non_bg_lums: list[float] = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if max(r, g, b) <= BG_MAX:
                continue
            non_bg_lums.append(luminance((r, g, b)))

    if not non_bg_lums:
        return

    min_l = min(non_bg_lums)
    max_l = max(non_bg_lums)
    span = max(1.0, max_l - min_l)

    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if max(r, g, b) <= BG_MAX:
                continue

            lum = luminance((r, g, b))
            t = (lum - min_l) / span

            # Push more body pixels toward the middle range so the icon does not wash out.
            t = 0.10 + 0.82 * smoothstep(t)
            nr, ng, nb = sample_gradient(t)

            # Preserve antialias softness on low-alpha edges.
            if a < 255:
                edge_mix = a / 255.0
                nr = round(r * (1.0 - edge_mix) + nr * edge_mix)
                ng = round(g * (1.0 - edge_mix) + ng * edge_mix)
                nb = round(b * (1.0 - edge_mix) + nb * edge_mix)

            px[x, y] = (nr, ng, nb, a)

    img.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Recolor app icons to the monster teal palette.")
    parser.add_argument("paths", nargs="+", help="PNG files to recolor in place")
    args = parser.parse_args()

    for raw_path in args.paths:
        recolor(Path(raw_path))


if __name__ == "__main__":
    main()
