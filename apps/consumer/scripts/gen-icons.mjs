/**
 * Generates all PWA icon sizes from the SVG source.
 * Run once: node scripts/gen-icons.mjs
 *
 * Output:
 *   public/brand/nuudl/png/icon-192.png       — manifest regular
 *   public/brand/nuudl/png/icon-512.png       — manifest regular
 *   public/brand/nuudl/png/icon-maskable.png  — manifest maskable (full-bleed)
 *   public/brand/nuudl/png/apple-touch-icon.png — iOS home screen (180×180)
 *   public/brand/nuudl/favicon-32.png         — browser tab fallback
 */

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public/brand/nuudl");
const pngDir = resolve(publicDir, "png");

// ─── Maskable SVG: full-bleed square, no pre-rounded corners ─────────────────
// The safe zone for maskable icons is the inner 80% of the canvas.
// Original content sits well within that area in the 1024×1024 source.
const maskableSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(512 512) rotate(90) scale(724)">
      <stop stop-color="#2C113F"/>
      <stop offset="1" stop-color="#0D0817"/>
    </radialGradient>
    <linearGradient id="neon" x1="214" y1="302" x2="820" y2="650" gradientUnits="userSpaceOnUse">
      <stop stop-color="#CF8BFF"/>
      <stop offset="0.55" stop-color="#B23CFF"/>
      <stop offset="1" stop-color="#E8C8FF"/>
    </linearGradient>
  </defs>
  <!-- Full-bleed background — iOS/Android apply their own mask -->
  <rect width="1024" height="1024" fill="url(#g)"/>
  <!-- Wave mark — shifted +25x +120y to center in safe zone -->
  <path d="M239 534C301 350 427 304 533 406C584 456 600 510 661 510C723 510 748 452 785 380"
    stroke="#C83FFF" stroke-width="82" stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>
  <path d="M239 534C301 350 427 304 533 406C584 456 600 510 661 510C723 510 748 452 785 380"
    stroke="url(#neon)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ─── Regular SVG: with rounded corners for non-masked contexts ────────────────
const regularSvg = readFileSync(resolve(publicDir, "app-icon.svg"));

async function generate(svgBuffer, outPath, size) {
  await sharp(svgBuffer).resize(size, size).png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`✓  ${outPath.split("public/")[1]}  (${size}×${size})`);
}

const maskableBuf = Buffer.from(maskableSvg);
const regularBuf = Buffer.isBuffer(regularSvg) ? regularSvg : Buffer.from(regularSvg);

// Manifest icons
await generate(maskableBuf, resolve(pngDir, "icon-192.png"), 192);
await generate(maskableBuf, resolve(pngDir, "icon-512.png"), 512);
await generate(maskableBuf, resolve(pngDir, "icon-maskable.png"), 512);

// Apple touch icon — iOS applies its own rounded mask, needs full-bleed
await generate(maskableBuf, resolve(pngDir, "apple-touch-icon.png"), 180);

// Small favicon fallback
await generate(maskableBuf, resolve(pngDir, "favicon-32.png"), 32);

// Regenerate the square app icon (flattened, no transparent corners)
await generate(maskableBuf, resolve(pngDir, "app-icon-square.png"), 1024);

console.log("\nDone. Update manifest.ts + layout.tsx references if needed.");
