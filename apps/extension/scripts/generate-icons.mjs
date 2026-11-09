// Generates PLACEHOLDER extension icons (blue rounded square + white paper plane).
// Replace src/icons/*.png with real artwork before a Chrome Web Store submission.
// Usage: node scripts/generate-icons.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLUE = [0x1a, 0x73, 0xe8];
const WHITE = [0xff, 0xff, 0xff];
const PLANE = [[0.2, 0.52], [0.8, 0.26], [0.58, 0.76], [0.47, 0.56]];
const SAMPLES = 4;

function inRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let bg = 0, plane = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (inRoundedSquare(x, y, 0.22)) {
            bg++;
            if (inPolygon(x, y, PLANE)) plane++;
          }
        }
      }
      const total = SAMPLES * SAMPLES;
      const alpha = bg / total;
      const mix = bg === 0 ? 0 : plane / bg;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BLUE[c] * (1 - mix) + WHITE[c] * mix);
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  return raw;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(root, 'src', 'icons');
await mkdir(dir, { recursive: true });
for (const size of [16, 48, 128]) {
  await writeFile(path.join(dir, `icon${size}.png`), png(size));
  console.log(`wrote src/icons/icon${size}.png`);
}
