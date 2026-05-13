// Rasterise build/icon.svg into the formats electron-builder expects:
//   build/icon.png   (1024x1024, used by Linux + as the universal fallback)
//   build/icon.ico   (multi-size Windows icon)
//   build/icon.icns  (macOS bundle icon)
//   build/tray.png   (small icon for the tray, scaled-down PNG)
//
// Run once before `electron-builder` (the workflow does this for us). The
// script intentionally has only two npm deps — sharp + png-to-ico — so it
// stays cheap on CI.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here  = path.dirname(fileURLToPath(import.meta.url));
const root  = path.resolve(here, '..');
const build = path.join(root, 'build');
const svg   = path.join(build, 'icon.svg');

async function ensureSvg() {
  try { await fs.access(svg); }
  catch { throw new Error('Missing ' + svg + ' — commit your source SVG first.'); }
}

async function makePng(targetSize, outPath) {
  await sharp(svg, { density: 384 })
    .resize(targetSize, targetSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log('[icons] wrote', path.relative(root, outPath));
}

async function makeIco() {
  // Windows .ico bundles multiple sizes; 16/32/48/64/128/256 covers Explorer
  // tiles and the Alt+Tab switcher without ballooning the file.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const s of sizes) {
    const b = await sharp(svg, { density: 384 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    buffers.push(b);
  }
  const ico = await pngToIco(buffers);
  const out = path.join(build, 'icon.ico');
  await fs.writeFile(out, ico);
  console.log('[icons] wrote', path.relative(root, out));
}

async function makeIcns() {
  // .icns layout per Apple's spec. We hand-roll it instead of shelling out
  // to iconutil so the script also works on Linux CI runners (the iconutil
  // binary only ships with macOS).
  const slots = [
    { size: 16,   type: 'icp4' },
    { size: 32,   type: 'icp5' },
    { size: 64,   type: 'icp6' },
    { size: 128,  type: 'ic07' },
    { size: 256,  type: 'ic08' },
    { size: 512,  type: 'ic09' },
    { size: 1024, type: 'ic10' }
  ];
  const chunks = [];
  for (const slot of slots) {
    const png = await sharp(svg, { density: 384 })
      .resize(slot.size, slot.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const header = Buffer.alloc(8);
    header.write(slot.type, 0, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(Buffer.concat([header, png]));
  }
  const body = Buffer.concat(chunks);
  const file = Buffer.alloc(8 + body.length);
  file.write('icns', 0, 'ascii');
  file.writeUInt32BE(file.length, 4);
  body.copy(file, 8);
  const out = path.join(build, 'icon.icns');
  await fs.writeFile(out, file);
  console.log('[icons] wrote', path.relative(root, out));
}

(async () => {
  await ensureSvg();
  await makePng(1024, path.join(build, 'icon.png'));
  await makePng(64,   path.join(build, 'tray.png'));
  await makeIco();
  await makeIcns();
  console.log('[icons] done.');
})().catch(err => {
  console.error('[icons] failed:', err.message || err);
  process.exit(1);
});
