import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'publish');
const outputDir = path.join(repoRoot, 'dist');
const versionFile = path.join(repoRoot, 'VERSION');
const VERSION_PLACEHOLDER = '__INJECT_APP_VERSION__';

const htmlMinifyOptions = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: {
        compress: true,
        mangle: true,
    },
};

async function copyPath(source, destination) {
    const stat = await fs.stat(source);

    if (stat.isDirectory()) {
        await fs.mkdir(destination, { recursive: true });
        const entries = await fs.readdir(source);

        for (const entry of entries) {
            await copyPath(path.join(source, entry), path.join(destination, entry));
        }

        return;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
}

async function readAppVersion() {
    const version = (await fs.readFile(versionFile, 'utf8')).trim();

    if (!version) {
        throw new Error(`VERSION file is empty: ${versionFile}`);
    }

    return version;
}

function injectAppVersion(source, version, label) {
    if (!source.includes(VERSION_PLACEHOLDER)) {
        throw new Error(`Missing ${VERSION_PLACEHOLDER} placeholder in ${label}`);
    }

    return source.replaceAll(VERSION_PLACEHOLDER, version);
}

async function build() {
    const appVersion = await readAppVersion();

    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    const indexHtml = injectAppVersion(
        await fs.readFile(path.join(sourceDir, 'index.html'), 'utf8'),
        appVersion,
        'publish/index.html'
    );
    const minifiedHtml = await minifyHtml(indexHtml, htmlMinifyOptions);
    await fs.writeFile(path.join(outputDir, 'index.html'), minifiedHtml);

    const swJs = injectAppVersion(
        await fs.readFile(path.join(sourceDir, 'sw.js'), 'utf8'),
        appVersion,
        'publish/sw.js'
    );
    const minifiedSw = await minifyJs(swJs, {
        compress: true,
        mangle: true,
        format: { comments: false },
    });

    if (minifiedSw.error) {
        throw minifiedSw.error;
    }

    await fs.writeFile(path.join(outputDir, 'sw.js'), minifiedSw.code);

    const staticPaths = [
        '.nojekyll',
        'manifest.webmanifest',
        'robots.txt',
        'sitemap.xml',
        'llms.txt',
        'icons',
    ];

    for (const relativePath of staticPaths) {
        const source = path.join(sourceDir, relativePath);

        try {
            await fs.access(source);
        } catch {
            continue;
        }

        await copyPath(source, path.join(outputDir, relativePath));
    }

    // Disable Jekyll on GitHub Pages (static deploy; no Liquid/_config processing).
    await fs.writeFile(path.join(outputDir, '.nojekyll'), '');

    const [sourceIndexSize, outputIndexSize, sourceSwSize, outputSwSize] =
        await Promise.all([
            fs.stat(path.join(sourceDir, 'index.html')).then(s => s.size),
            fs.stat(path.join(outputDir, 'index.html')).then(s => s.size),
            fs.stat(path.join(sourceDir, 'sw.js')).then(s => s.size),
            fs.stat(path.join(outputDir, 'sw.js')).then(s => s.size),
        ]);

    console.log(
        `Built dist/ (v${appVersion}): index.html ${formatBytes(sourceIndexSize)} → ${formatBytes(outputIndexSize)}, ` +
            `sw.js ${formatBytes(sourceSwSize)} → ${formatBytes(outputSwSize)}`
    );
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    return `${(bytes / 1024).toFixed(1)} KiB`;
}

build().catch(error => {
    console.error(error);
    process.exit(1);
});
