/**
 * Generate LifeOS PWA icons (192x192 and 512x512) as proper PNGs.
 * Dark background (#0f0f14) with indigo "L" lettermark (#6366f1).
 * Uses only Node.js built-ins (no canvas/sharp dependency).
 *
 * Strategy: write raw RGBA pixel data, deflate, wrap in PNG chunks.
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makePNG(width, height, pixels) {
  // pixels = Uint8Array of RGBA, length = width * height * 4
  // Add filter byte (0 = None) before each row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    pixels.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const chunks = [];
  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  function writeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    chunks.push(Buffer.concat([len, typeAndData, crc]));
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  writeChunk('IHDR', ihdr);

  // IDAT
  writeChunk('IDAT', compressed);

  // IEND
  writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat(chunks);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const bgR = 0x0f, bgG = 0x0f, bgB = 0x14;
  const acR = 0x63, acG = 0x66, acB = 0xf1;

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = bgR;
    pixels[i * 4 + 1] = bgG;
    pixels[i * 4 + 2] = bgB;
    pixels[i * 4 + 3] = 255;
  }

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    const alpha = a / 255;
    pixels[idx] = Math.round(r * alpha + pixels[idx] * (1 - alpha));
    pixels[idx + 1] = Math.round(g * alpha + pixels[idx + 1] * (1 - alpha));
    pixels[idx + 2] = Math.round(b * alpha + pixels[idx + 2] * (1 - alpha));
    pixels[idx + 3] = 255;
  }

  function fillCircle(cx, cy, radius, r, g, b, a = 255) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          setPixel(Math.round(cx + dx), Math.round(cy + dy), r, g, b, a);
        }
      }
    }
  }

  function fillRect(x, y, w, h, r, g, b, a = 255) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPixel(Math.round(x + dx), Math.round(y + dy), r, g, b, a);
      }
    }
  }

  // Draw a subtle radial gradient background circle (slightly lighter center)
  const center = size / 2;
  const outerR = size * 0.42;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      if (dist < outerR) {
        const t = dist / outerR;
        // Gradient from slightly lighter center to bg
        const r = Math.round(0x1a + (bgR - 0x1a) * t);
        const g = Math.round(0x1a + (bgG - 0x1a) * t);
        const b = Math.round(0x24 + (bgB - 0x24) * t);
        setPixel(x, y, r, g, b);
      }
    }
  }

  // Draw indigo accent ring
  const ringR = size * 0.38;
  const ringThick = Math.max(2, size * 0.015);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      if (dist >= ringR - ringThick && dist <= ringR + ringThick) {
        const edgeDist = Math.min(Math.abs(dist - ringR + ringThick), Math.abs(dist - ringR - ringThick));
        const alpha = Math.min(255, edgeDist * 255 / ringThick);
        setPixel(x, y, acR, acG, acB, Math.round(120 + alpha * 0.3));
      }
    }
  }

  // Draw "L" lettermark in indigo
  const letterScale = size / 192; // normalize to 192px base
  const lx = Math.round(size * 0.35); // left edge of L
  const ly = Math.round(size * 0.28); // top of L
  const lw = Math.round(28 * letterScale); // vertical bar width
  const lh = Math.round(85 * letterScale); // vertical bar height
  const lbw = Math.round(55 * letterScale); // bottom bar width
  const lbh = Math.round(28 * letterScale); // bottom bar height

  // Vertical bar of L
  fillRect(lx, ly, lw, lh, acR, acG, acB);
  // Horizontal bar of L
  fillRect(lx, ly + lh - lbh, lbw, lbh, acR, acG, acB);

  // Add a subtle glow around the L (larger, semi-transparent circles at corners)
  const glowR = Math.round(8 * letterScale);
  fillCircle(lx + lw / 2, ly, glowR, acR, acG, acB, 40);
  fillCircle(lx + lbw, ly + lh - lbh / 2, glowR, acR, acG, acB, 40);

  // Small accent dots (node-like) in each corner to hint at the graph motif
  const dotR = Math.round(6 * letterScale);
  const margin = Math.round(size * 0.18);
  // top-right: red (health)
  fillCircle(size - margin, margin, dotR, 0xef, 0x44, 0x44, 180);
  // bottom-right: amber (meals)
  fillCircle(size - margin, size - margin, dotR, 0xf5, 0x9e, 0x0b, 180);
  // bottom-left: green (pantry)
  fillCircle(margin, size - margin, dotR, 0x22, 0xc5, 0x5e, 180);
  // top-left: purple (supplements)
  fillCircle(margin, margin, dotR, 0x8b, 0x5c, 0xf6, 180);

  return pixels;
}

// Generate both sizes
for (const size of [192, 512]) {
  const pixels = drawIcon(size);
  const png = makePNG(size, size, pixels);
  const outPath = resolve(__dirname, `../static/icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
