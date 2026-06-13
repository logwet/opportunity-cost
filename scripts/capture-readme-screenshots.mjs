import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'assets', 'readme');

const IPHONE_17_PRO = {
    width: 402,
    height: 874,
    deviceScaleFactor: 3,
};

// Standalone PWA safe areas on Dynamic Island iPhones (Playwright has none by default).
const IPHONE_SAFE_AREA = {
    top: 59,
    bottom: 34,
};

const MACBOOK_AIR = {
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    zoom: 0.85,
};

const PHONE_BEZEL = {
    side: 3,
    top: 3,
    bottom: 3,
    radius: 47,
    screenRadius: 44,
    shadowPad: 32,
};

const BROWSER_FRAME = {
    titleBar: 28,
    radius: 12,
    shadowPad: 40,
    trafficLightRadius: 6,
    trafficLightGap: 8,
    trafficLightInset: 14,
};

async function applyIphoneSafeAreas(context) {
    const { top, bottom } = IPHONE_SAFE_AREA;
    await context.addInitScript(({ top, bottom }) => {
        const css = `
            body {
                padding-top: max(24px, ${top}px) !important;
                padding-bottom: max(24px, ${bottom}px) !important;
            }
        `;
        const inject = () => {
            let style = document.getElementById('playwright-safe-area');
            if (!style) {
                style = document.createElement('style');
                style.id = 'playwright-safe-area';
                document.documentElement.appendChild(style);
            }
            style.textContent = css;
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', inject, { once: true });
        } else {
            inject();
        }
    }, { top, bottom });
}

async function setTheme(page, theme) {
    await page.evaluate(themeValue => {
        const settings = JSON.parse(
            localStorage.getItem('opportunityCostSettings') || '{}'
        );
        settings.colorTheme = themeValue;
        localStorage.setItem(
            'opportunityCostSettings',
            JSON.stringify(settings)
        );
    }, theme);
}

async function waitForApp(page) {
    await page.waitForSelector('#retirementValue');
    await page.waitForSelector('#growthChart');
    await page.waitForFunction(() => {
        const chart = document.getElementById('growthChart');
        return chart && chart.innerHTML.trim().length > 0;
    });
    await page.waitForTimeout(500);
}

async function scrollToTop(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
}

async function scrollToPhoneResults(page) {
    await page.evaluate(() => {
        const toggle = document.querySelector('.display-mode-control');
        const retirementTitle = document.getElementById('retirementTitle');
        const chart = document.getElementById('growthChart');

        if (!toggle || !retirementTitle || !chart) {
            return;
        }

        const toggleBottom =
            toggle.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo(0, Math.max(0, toggleBottom + 4));
    });
    await page.waitForTimeout(150);
}

async function applyMacbookZoom(page) {
    await page.addStyleTag({
        content: `:root { zoom: ${MACBOOK_AIR.zoom}; }`,
    });
    await page.waitForTimeout(200);
}

async function scrollToMacbookResults(page) {
    await page.evaluate(() => {
        const pageHeader = document.querySelector('.page-header');

        if (pageHeader) {
            const top = pageHeader.getBoundingClientRect().top + window.scrollY - 12;
            window.scrollTo(0, Math.max(0, top));
            return;
        }

        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(150);
}

async function captureViewport(page) {
    return page.screenshot({ type: 'png' });
}

async function clipRoundedScreen(screenshotBuffer, screenW, screenH, screenRadius) {
    const roundedScreen = await sharp(screenshotBuffer)
        .resize(screenW, screenH, { fit: 'cover' })
        .png()
        .toBuffer();

    const screenMask = Buffer.from(`
        <svg width="${screenW}" height="${screenH}">
            <rect
                x="0" y="0"
                width="${screenW}" height="${screenH}"
                rx="${screenRadius}" ry="${screenRadius}"
                fill="white"
            />
        </svg>
    `);

    return sharp(roundedScreen)
        .composite([{ input: await sharp(screenMask).png().toBuffer(), blend: 'dest-in' }])
        .png()
        .toBuffer();
}

async function wrapInPhoneFrame(screenshotBuffer, theme = 'dark', { showNotch = true } = {}) {
    const scale = IPHONE_17_PRO.deviceScaleFactor;
    const screenW = IPHONE_17_PRO.width * scale;
    const screenH = IPHONE_17_PRO.height * scale;
    const bezelSide = PHONE_BEZEL.side * scale;
    const bezelTop = PHONE_BEZEL.top * scale;
    const bezelBottom = PHONE_BEZEL.bottom * scale;
    const deviceW = screenW + bezelSide * 2;
    const deviceH = screenH + bezelTop + bezelBottom;
    const outerRadius = PHONE_BEZEL.radius * scale;
    const screenRadius = PHONE_BEZEL.screenRadius * scale;
    const shadowPad = PHONE_BEZEL.shadowPad * scale;
    const outerW = deviceW + shadowPad * 2;
    const outerH = deviceH + shadowPad * 2;
    const deviceX = shadowPad;
    const deviceY = shadowPad;
    const screenX = deviceX + bezelSide;
    const screenY = deviceY + bezelTop;

    const islandW = Math.round(screenW * (126 / 393));
    const islandH = Math.round(screenH * (37 / 852));
    const islandX = Math.round((screenW - islandW) / 2);
    const islandY = Math.round(11 * scale);
    const homeW = Math.round(screenW * (134 / 393));
    const homeH = Math.max(4, Math.round(5 * scale));
    const homeX = Math.round((screenW - homeW) / 2);
    const homeY = screenH - Math.round(21 * scale);
    const homeFill = theme === 'light' ? '#000000' : '#ffffff';
    const homeOpacity = theme === 'light' ? 0.22 : 0.34;

    const clippedScreen = await clipRoundedScreen(
        screenshotBuffer,
        screenW,
        screenH,
        screenRadius
    );

    const frameSvg = Buffer.from(`
        <svg width="${outerW}" height="${outerH}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="phoneEdge" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#3a3a3c"/>
                    <stop offset="50%" stop-color="#1c1c1e"/>
                    <stop offset="100%" stop-color="#2c2c2e"/>
                </linearGradient>
                <filter id="phoneShadow" x="-35%" y="-35%" width="170%" height="170%">
                    <feDropShadow dx="0" dy="${12 * scale}" stdDeviation="${20 * scale}" flood-color="#000000" flood-opacity="0.38"/>
                </filter>
            </defs>
            <rect
                x="${deviceX}" y="${deviceY}"
                width="${deviceW}" height="${deviceH}"
                rx="${outerRadius}" ry="${outerRadius}"
                fill="url(#phoneEdge)"
                filter="url(#phoneShadow)"
            />
            <rect
                x="${screenX}" y="${screenY}"
                width="${screenW}" height="${screenH}"
                rx="${screenRadius}" ry="${screenRadius}"
                fill="#000000"
            />
        </svg>
    `);

    const overlaySvg = Buffer.from(`
        <svg width="${screenW}" height="${screenH}" xmlns="http://www.w3.org/2000/svg">
            ${showNotch ? `<rect
                x="${islandX}" y="${islandY}"
                width="${islandW}" height="${islandH}"
                rx="${islandH / 2}" ry="${islandH / 2}"
                fill="#000000"
            />` : ''}
            <rect
                x="${homeX}" y="${homeY}"
                width="${homeW}" height="${homeH}"
                rx="${homeH / 2}" ry="${homeH / 2}"
                fill="${homeFill}"
                opacity="${homeOpacity}"
            />
        </svg>
    `);

    const frame = await sharp(frameSvg).png().toBuffer();
    const overlay = await sharp(overlaySvg).png().toBuffer();

    return sharp(frame)
        .composite([
            { input: clippedScreen, left: screenX, top: screenY },
            { input: overlay, left: screenX, top: screenY },
        ])
        .png()
        .toBuffer();
}

async function wrapInBrowserFrame(screenshotBuffer) {
    const scale = MACBOOK_AIR.deviceScaleFactor;
    const contentW = MACBOOK_AIR.width * scale;
    const contentH = MACBOOK_AIR.height * scale;
    const titleBarH = BROWSER_FRAME.titleBar * scale;
    const radius = BROWSER_FRAME.radius * scale;
    const shadowPad = BROWSER_FRAME.shadowPad * scale;
    const windowW = contentW;
    const windowH = contentH + titleBarH;
    const outerW = windowW + shadowPad * 2;
    const outerH = windowH + shadowPad * 2;
    const windowX = shadowPad;
    const windowY = shadowPad;
    const contentX = windowX;
    const contentY = windowY + titleBarH;
    const dotR = BROWSER_FRAME.trafficLightRadius * scale;
    const dotGap = BROWSER_FRAME.trafficLightGap * scale;
    const dotX = windowX + BROWSER_FRAME.trafficLightInset * scale;
    const dotY = windowY + titleBarH / 2;
    const redX = dotX;
    const yellowX = dotX + dotR * 2 + dotGap;
    const greenX = yellowX + dotR * 2 + dotGap;

    const clippedContent = await sharp(screenshotBuffer)
        .resize(contentW, contentH, { fit: 'cover' })
        .png()
        .toBuffer();

    const contentMask = Buffer.from(`
        <svg width="${contentW}" height="${contentH}">
            <path
                d="M 0 0 H ${contentW} V ${contentH - radius} Q ${contentW} ${contentH} ${contentW - radius} ${contentH} H ${radius} Q 0 ${contentH} 0 ${contentH - radius} Z"
                fill="white"
            />
        </svg>
    `);

    const maskedContent = await sharp(clippedContent)
        .composite([{ input: await sharp(contentMask).png().toBuffer(), blend: 'dest-in' }])
        .png()
        .toBuffer();

    const frameSvg = Buffer.from(`
        <svg width="${outerW}" height="${outerH}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="browserShadow" x="-30%" y="-30%" width="160%" height="165%">
                    <feDropShadow dx="0" dy="${16 * scale}" stdDeviation="${28 * scale}" flood-color="#000000" flood-opacity="0.38"/>
                </filter>
            </defs>
            <rect
                x="${windowX}" y="${windowY}"
                width="${windowW}" height="${windowH}"
                rx="${radius}" ry="${radius}"
                fill="#2b2b2d"
                stroke="#1a1a1c"
                stroke-width="${Math.max(1, scale)}"
                filter="url(#browserShadow)"
            />
            <rect
                x="${windowX}" y="${windowY}"
                width="${windowW}" height="${titleBarH + radius}"
                rx="${radius}" ry="${radius}"
                fill="#3a3a3c"
            />
            <rect
                x="${windowX}" y="${windowY + titleBarH}"
                width="${windowW}" height="${radius}"
                fill="#3a3a3c"
            />
            <circle cx="${redX + dotR}" cy="${dotY}" r="${dotR}" fill="#ff5f57"/>
            <circle cx="${yellowX + dotR}" cy="${dotY}" r="${dotR}" fill="#febc2e"/>
            <circle cx="${greenX + dotR}" cy="${dotY}" r="${dotR}" fill="#28c840"/>
        </svg>
    `);

    const frame = await sharp(frameSvg).png().toBuffer();

    return sharp(frame)
        .composite([{ input: maskedContent, left: contentX, top: contentY }])
        .png()
        .toBuffer();
}

async function captureIphoneScreenshots(baseUrl) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: {
            width: IPHONE_17_PRO.width,
            height: IPHONE_17_PRO.height,
        },
        deviceScaleFactor: IPHONE_17_PRO.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
    });
    await applyIphoneSafeAreas(context);
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'load' });
    await setTheme(page, 'light');
    await page.reload({ waitUntil: 'load' });
    await waitForApp(page);
    await scrollToTop(page);
    const light = await captureViewport(page);

    await setTheme(page, 'dark');
    await page.reload({ waitUntil: 'load' });
    await waitForApp(page);
    await scrollToPhoneResults(page);
    const dark = await captureViewport(page);

    await browser.close();

    return { light, dark };
}

async function captureMacbookScreenshot(baseUrl) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: {
            width: MACBOOK_AIR.width,
            height: MACBOOK_AIR.height,
        },
        deviceScaleFactor: MACBOOK_AIR.deviceScaleFactor,
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
    });
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'load' });
    await setTheme(page, 'dark');
    await page.reload({ waitUntil: 'load' });
    await waitForApp(page);
    await applyMacbookZoom(page);
    await scrollToMacbookResults(page);
    const dark = await captureViewport(page);

    await browser.close();

    return dark;
}

async function writeFile(name, buffer) {
    const filePath = path.join(outputDir, name);
    await fs.writeFile(filePath, buffer);
    console.log(`Wrote ${filePath}`);
}

async function main() {
    const baseUrl = process.argv[2] || 'http://127.0.0.1:9876/';

    await fs.mkdir(outputDir, { recursive: true });

    console.log(`Capturing from ${baseUrl} …`);
    console.log('(Serve publish/ first, e.g. python3 -m http.server 9876 --directory publish)');

    const iphone = await captureIphoneScreenshots(baseUrl);
    await writeFile(
        'iphone-17-pro-light.png',
        await wrapInPhoneFrame(iphone.light, 'light')
    );
    await writeFile(
        'iphone-17-pro-dark.png',
        await wrapInPhoneFrame(iphone.dark, 'dark', { showNotch: false })
    );

    const macbook = await captureMacbookScreenshot(baseUrl);
    await writeFile('macbook-air.png', await wrapInBrowserFrame(macbook));

    for (const stale of ['macbook-air-light.png', 'macbook-air-dark.png']) {
        try {
            await fs.unlink(path.join(outputDir, stale));
            console.log(`Removed stale ${stale}`);
        } catch {
            // already absent
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
