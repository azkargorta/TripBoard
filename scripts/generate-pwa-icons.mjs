/**
 * Genera PNG 192/512 desde public/brand/icon.png (PWA / TWA / Play).
 * Uso: npm run icons:generate
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcPngPath = join(root, "public", "brand", "icon.png");
const srcPng = await readFile(srcPngPath);

for (const size of [192, 512]) {
  const out = join(root, "public", "icons", `icon-${size}.png`);
  await sharp(srcPng).resize(size, size).png().toFile(out);
  console.log("Wrote", out);
}
