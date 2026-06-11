#!/usr/bin/env python3
"""Render PNG PWA icons from icons/icon.svg using resvg-js."""

import subprocess
import sys
from pathlib import Path

ICON_DIR = Path(__file__).parent
SVG = ICON_DIR / 'icon.svg'


def main():
    if not SVG.exists():
        print(f'Missing {SVG}', file=sys.stderr)
        sys.exit(1)

    for size in (192, 512):
        output = ICON_DIR / f'icon-{size}.png'
        subprocess.run(
            [
                'npx',
                '--yes',
                '@resvg/resvg-js-cli',
                str(SVG),
                str(output),
                '--fit-width',
                str(size),
            ],
            check=True,
        )
        print(f'wrote {output}')


if __name__ == '__main__':
    main()
