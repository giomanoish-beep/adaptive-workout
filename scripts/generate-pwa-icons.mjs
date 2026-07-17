import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = fileURLToPath(new URL('../apps/web/public/favicon.svg', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../apps/web/public/icons/', import.meta.url));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const outputs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-192.png', 192],
  ['icon-maskable-512.png', 512],
];

function assertPng(buffer, expectedSize, filename) {
  assert(buffer.subarray(0, 8).equals(pngSignature), `${filename} is not a PNG`);
  assert.equal(buffer.readUInt32BE(16), expectedSize, `${filename} has the wrong width`);
  assert.equal(buffer.readUInt32BE(20), expectedSize, `${filename} has the wrong height`);
}

const source = await readFile(sourcePath, 'utf8');
assert(source.includes('viewBox="0 0 512 512"'), 'favicon.svg must retain its 512-square viewBox');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const [filename, size] of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sizedSource = source.replace(
      '<svg ',
      `<svg width="${size}" height="${size}" style="display:block" `,
    );
    await page.setContent(`<style>*{margin:0;padding:0}</style>${sizedSource}`);
    const outputPath = `${outputDirectory}${filename}`;
    await page.locator('svg').screenshot({ path: outputPath });
    const png = await readFile(outputPath);
    assertPng(png, size, filename);
    console.log(`generated ${outputPath.slice(root.length)} (${size}x${size})`);
    await page.close();
  }
} finally {
  await browser.close();
}
