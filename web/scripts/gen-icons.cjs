// Dependency-free PNG/ICO icon generator for GameDeck.
// Draws the "Stack" mark: three isometric amber/ember slabs on a solid tile,
// matching the japandi palette used across the app. Uses only Node built-ins.
//
// Outputs (public/icons):
//   icon-{120,152,167,180,192,512,1024}.png        dark graphite tile (home screen)
//   icon-{120,152,167,180,192,512}-light.png        porcelain tile (light mode)
//   favicon-16.png favicon-32.png favicon.ico        rounded, dark
//   icon.svg                                         adaptive vector (dark/light)
//
// Run with: node scripts/gen-icons.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- palette ---------------------------------------------------------------
const GRAPHITE = '#1a1917';
const PORCELAIN = '#ece2d2';

// amber -> ember ramp, brightest slab on top. Dark-tile version.
const MARK_DARK = {
  bottom: { top: '#9a3b0c', left: '#792d08', right: '#5c2206' },
  mid: { top: '#c85c15', left: '#9a3b0c', right: '#792d08' },
  top: { top: '#f5a623', left: '#d97716', right: '#b4590f' },
};
// slightly deeper so it keeps contrast on the light porcelain tile.
const MARK_LIGHT = {
  bottom: { top: '#8a3409', left: '#6b2606', right: '#511d05' },
  mid: { top: '#b44f12', left: '#8a3409', right: '#6b2606' },
  top: { top: '#e0871a', left: '#c2610f', right: '#9a3b0c' },
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// --- minimal PNG encoder (RGBA, 8-bit) -------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, c]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4; const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- geometry (in a 512 unit space, then scaled) ---------------------------
const U = 512;
const CX = 256;
const CY = 256;
// How much of the tile the mark fills. Scaled about the tile centre (the stack is
// already centred on 256), so raising this grows the mark without shifting it.
// 1.12 takes the stack from 236x286 to 264x320 in the 512 unit space, which is
// still ~124 units of clear tile on each side.
const MARK_SCALE = 1.12;
const sc = (v) => v * MARK_SCALE;
// Scale a y ABOUT the centre rather than from the origin, otherwise the whole
// stack slides down the tile as it grows.
const scY = (y) => CY + (y - CY) * MARK_SCALE;
// three slabs: [topY]. shifted so the stack is vertically centred in the tile.
const SLABS = [
  { y: scY(306), c: 'bottom' },
  { y: scY(239), c: 'mid' },
  { y: scY(172), c: 'top' },
];
const W = sc(118), H = sc(59), T = sc(34); // half-width, half-height, thickness

function slabPolys(y, colors) {
  const T_ = [CX, y - H], R = [CX + W, y], B = [CX, y + H], L = [CX - W, y];
  const Bt = [CX, y + H + T], Lt = [CX - W, y + T], Rt = [CX + W, y + T];
  return [
    { pts: [L, B, Bt, Lt], color: colors.left },
    { pts: [R, B, Bt, Rt], color: colors.right },
    { pts: [T_, R, B, L], color: colors.top },
  ];
}
function scenePolys(mark) {
  const out = [];
  for (const s of SLABS) out.push(...slabPolys(s.y, mark[s.c]));
  return out; // painter order: bottom slab first, top slab last
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const hit = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// Rounded-square corner test (for favicons). r in unit space.
function insideRounded(x, y, size, r) {
  const rx = x < r ? r - x : x > size - r ? x - (size - r) : 0;
  const ry = y < r ? r - y : y > size - r ? y - (size - r) : 0;
  if (rx === 0 || ry === 0) return true;
  return rx * rx + ry * ry <= r * r;
}

// --- render one icon at `size`, supersampled for smooth edges --------------
function drawIcon(size, { bg, mark, rounded }) {
  const SS = 4;
  const hi = size * SS;
  const scale = hi / U;
  const polys = scenePolys(mark).map((p) => ({ color: hex(p.color), pts: p.pts.map(([x, y]) => [x * scale, y * scale]) }));
  const bgRGB = hex(bg);
  const cornerR = rounded ? hi * 0.223 : 0;

  const buf = Buffer.alloc(hi * hi * 4);
  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const idx = (y * hi + x) * 4;
      const px = x + 0.5, py = y + 0.5;
      if (rounded && !insideRounded(px, py, hi, cornerR)) { buf[idx + 3] = 0; continue; }
      let col = bgRGB;
      // painter's order: last matching polygon wins
      for (let k = 0; k < polys.length; k++) {
        if (pointInPoly(px, py, polys[k].pts)) col = polys[k].color;
      }
      buf[idx] = col[0]; buf[idx + 1] = col[1]; buf[idx + 2] = col[2]; buf[idx + 3] = 255;
    }
  }
  // box downsample SSxSS
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * hi + (x * SS + sx)) * 4;
          const pa = buf[i + 3];
          r += buf[i] * pa; g += buf[i + 1] * pa; b += buf[i + 2] * pa; a += pa;
        }
      }
      const o = (y * size + x) * 4; const n = SS * SS;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

// --- ICO writer (wraps PNGs) ----------------------------------------------
function encodeIco(entries) {
  // entries: [{size, png}]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  const bodies = [];
  entries.forEach((e, i) => {
    const b = i * 16;
    dir[b] = e.size >= 256 ? 0 : e.size;
    dir[b + 1] = e.size >= 256 ? 0 : e.size;
    dir[b + 2] = 0; dir[b + 3] = 0;
    dir.writeUInt16LE(1, b + 4); dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(e.png.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += e.png.length; bodies.push(e.png);
  });
  return Buffer.concat([header, dir, ...bodies]);
}

// --- adaptive SVG ----------------------------------------------------------
function buildSvg() {
  // Round on the way out. MARK_SCALE is fractional, so raw coordinates serialise as
  // 123.83999999999997 and the file churns on every regeneration for no visual gain.
  const n = (v) => String(Math.round(v * 100) / 100);
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.map(n).join(',')).join(' ')}" fill="${fill}"/>`;
  const marks = scenePolys(MARK_DARK).map((p) => poly(p.pts, p.color)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="GameDeck">
  <style>
    .bg{fill:${GRAPHITE}}
    @media (prefers-color-scheme: light){ .bg{fill:${PORCELAIN}} }
  </style>
  <rect class="bg" width="512" height="512" rx="114" ry="114"/>
  <g>${marks}</g>
</svg>
`;
}

// --- main ------------------------------------------------------------------
function main() {
  const outDir = path.join(__dirname, '..', 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name, buf) => { fs.writeFileSync(path.join(outDir, name), buf); console.log(`wrote ${name} (${buf.length} b)`); };

  const DARK = { bg: GRAPHITE, mark: MARK_DARK, rounded: false };
  const LIGHT = { bg: PORCELAIN, mark: MARK_LIGHT, rounded: false };

  for (const s of [120, 152, 167, 180, 192, 512, 1024]) write(`icon-${s}.png`, encodePng(s, s, drawIcon(s, DARK)));
  for (const s of [120, 152, 167, 180, 192, 512]) write(`icon-${s}-light.png`, encodePng(s, s, drawIcon(s, LIGHT)));

  const fav16 = encodePng(16, 16, drawIcon(16, { bg: GRAPHITE, mark: MARK_DARK, rounded: true }));
  const fav32 = encodePng(32, 32, drawIcon(32, { bg: GRAPHITE, mark: MARK_DARK, rounded: true }));
  write('favicon-16.png', fav16);
  write('favicon-32.png', fav32);
  write('favicon.ico', encodeIco([{ size: 16, png: fav16 }, { size: 32, png: fav32 }]));

  fs.writeFileSync(path.join(outDir, 'icon.svg'), buildSvg());
  console.log('wrote icon.svg');
}

main();
