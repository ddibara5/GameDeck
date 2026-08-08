// Tiny, dependency-free PNG icon generator for GameDeck.
// Draws a walnut rounded-square badge with a brass "G" glyph, matching the
// japandi palette used across the app. Uses only Node's built-in zlib.
//
// Run with: node scripts/gen-icons.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WALNUT = [111, 78, 55]; // --walnut
const ACCENT = [200, 169, 126]; // --accent (brass)

// --- minimal PNG encoder (RGBA, 8-bit, no interlace) ---------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing helpers -------------------------------------------------------

function setPixel(rgba, width, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= width) return;
  const idx = (y * width + x) * 4;
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
}

// Simple 5x7 bitmap font, just the glyph "G".
const GLYPH_G = [
  '01111',
  '10000',
  '10000',
  '10011',
  '10001',
  '10001',
  '01111',
];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);

  const insideRoundedRect = (x, y) => {
    const rx = x < radius ? radius - x : x > size - 1 - radius ? x - (size - 1 - radius) : 0;
    const ry = y < radius ? radius - y : y > size - 1 - radius ? y - (size - 1 - radius) : 0;
    if (rx === 0 || ry === 0) return true;
    return rx * rx + ry * ry <= radius * radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (insideRoundedRect(x, y)) {
        setPixel(rgba, size, x, y, WALNUT, 255);
      } else {
        setPixel(rgba, size, x, y, WALNUT, 0);
      }
    }
  }

  // Draw the brass "G" glyph, scaled up and centered.
  const glyphCols = GLYPH_G[0].length;
  const glyphRows = GLYPH_G.length;
  const scale = Math.floor((size * 0.5) / glyphRows);
  const glyphW = glyphCols * scale;
  const glyphH = glyphRows * scale;
  const offsetX = Math.round((size - glyphW) / 2);
  const offsetY = Math.round((size - glyphH) / 2);

  for (let row = 0; row < glyphRows; row++) {
    for (let col = 0; col < glyphCols; col++) {
      if (GLYPH_G[row][col] === '1') {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = offsetX + col * scale + sx;
            const y = offsetY + row * scale + sy;
            setPixel(rgba, size, x, y, ACCENT, 255);
          }
        }
      }
    }
  }

  return rgba;
}

function main() {
  const outDir = path.join(__dirname, '..', 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  for (const size of [192, 512]) {
    const rgba = drawIcon(size);
    const png = encodePng(size, size, rgba);
    const outPath = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(outPath, png);
    console.log(`wrote ${outPath} (${png.length} bytes)`);
  }
}

main();
