/**
 * Generiert PWA-Icons aus einer Quelldatei via sharp.
 *
 * Suchreihenfolge (erste vorhandene Datei gewinnt):
 *   1. public/icons/source.png
 *   2. public/icons/source.jpg / .jpeg / .webp
 *   3. public/icons/icon.svg   (Default-Fallback, ausgeliefert im Repo)
 *
 * Ausführen mit:  npm run icons
 *
 * Erzeugt:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png  (mit Safe-Zone-Padding)
 *   public/apple-touch-icon.png         (180×180 für iOS-Homescreen)
 *   public/favicon.ico                  (32×32, aus PNG)
 */

import { readFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const iconsDir = path.join(root, "public", "icons");

const CANDIDATES = [
  "public/icons/source.png",
  "public/icons/source.jpg",
  "public/icons/source.jpeg",
  "public/icons/source.webp",
  "public/icons/icon.svg",
];

async function resolveSource() {
  for (const rel of CANDIDATES) {
    const abs = path.join(root, rel);
    try {
      await access(abs);
      return { abs, rel };
    } catch {
      /* nicht vorhanden – nächster Kandidat */
    }
  }
  throw new Error(
    `Keine Quelldatei gefunden. Erwartet eine der: ${CANDIDATES.join(", ")}`,
  );
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  const source = await resolveSource();
  console.log(`Quelle: ${source.rel}`);
  const raw = await readFile(source.abs);
  const isSvg = source.rel.endsWith(".svg");

  const loader = (buf) =>
    isSvg ? sharp(buf, { density: 384 }) : sharp(buf);

  const targets = [
    { file: "public/icons/icon-192.png", size: 192 },
    { file: "public/icons/icon-512.png", size: 512 },
    { file: "public/apple-touch-icon.png", size: 180 },
  ];

  for (const t of targets) {
    await loader(raw)
      .resize(t.size, t.size, { fit: "contain", background: "#0a0a0a" })
      .png()
      .toFile(path.join(root, t.file));
    console.log(`✓ ${t.file}`);
  }

  // Maskable-Version: mehr Padding, damit runde/quadratische Masken
  // das Motiv nicht abschneiden (Safe-Zone ~72 %).
  const maskableSize = 512;
  const inner = Math.round(maskableSize * 0.72);
  const bg = await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: "#0a0a0a",
    },
  })
    .png()
    .toBuffer();

  const innerBuf = await loader(raw)
    .resize(inner, inner, { fit: "contain", background: "#0a0a0a" })
    .png()
    .toBuffer();

  const offset = Math.round((maskableSize - inner) / 2);
  await sharp(bg)
    .composite([{ input: innerBuf, top: offset, left: offset }])
    .png()
    .toFile(path.join(iconsDir, "icon-maskable-512.png"));
  console.log("✓ public/icons/icon-maskable-512.png");

  // Favicon (32×32 PNG, umbenannt zu .ico – Browser akzeptieren das).
  await loader(raw)
    .resize(32, 32)
    .png()
    .toFile(path.join(root, "public", "favicon.ico"));
  console.log("✓ public/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
