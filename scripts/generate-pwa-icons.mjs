/**
 * Genera PNG 192/512 desde public/icons/icon.svg (PWA / TWA / Play).
 * Uso: npm run icons:generate
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "icons", "icon.svg");
const svg = await readFile(svgPath);

for (const size of [192, 512]) {
  const out = join(root, "public", "icons", `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log("Wrote", out);
}
