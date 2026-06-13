import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const iconDir = path.join(repoRoot, 'publish', 'icons');
const svgPath = path.join(iconDir, 'icon.svg');

function main() {
    if (!fs.existsSync(svgPath)) {
        console.error(`Missing ${svgPath}`);
        process.exit(1);
    }

    const svgSource = fs.readFileSync(svgPath, 'utf8');

    for (const size of [192, 512]) {
        const resvg = new Resvg(svgSource, {
            fitTo: {
                mode: 'width',
                value: size,
            },
        });
        const output = path.join(iconDir, `icon-${size}.png`);

        fs.writeFileSync(output, resvg.render().asPng());
        console.log(`wrote ${output}`);
    }
}

main();
