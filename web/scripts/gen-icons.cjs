// Dependency-free PNG/ICO icon generator for GameDeck.
// Draws the "Stack" mark: three isometric amber/ember slabs on a lit tile,
// matching the japandi palette used across the app. Uses only Node built-ins.
//
// Outputs (public/icons), ONE set, no appearance suffix on purpose:
//   icon-{120,152,167,180,192,512,1024}.png   graphite tile (home screen + manifest)
//   favicon-16.png favicon-32.png favicon.ico  rounded, flat graphite
//   icon.svg                                   graphite vector (browser favicon)
//
// Run with: node scripts/gen-icons.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- palette ---------------------------------------------------------------
// Exactly the app's --bg. The tile's outer field, the manifest's theme_color and
// background_color, and the app's own background are now one value, so the icon,
// the splash screen and the first frame of the app do not step in tone.
const GRAPHITE = '#1a1917';

// The tile is a warm bloom behind the stack rather than one flat colour.
// Measured on the pre-v6 art, the background's luminance range was exactly 0: a
// dead field, which is why the mark read as pasted on rather than sitting on
// anything.
//
// A vertical gradient plus a contact shadow was the right answer on porcelain
// and the wrong one here. On graphite a contact shadow has nothing to darken,
// and the only treatment that reads is one whose highlight carries HUE: the
// bloom picks up the mark's own amber and lifts it off the tile. Mocked both
// ways and compared before choosing.
const HALO_CENTRE = '#42301d';
const HALO_EDGE = GRAPHITE;

// amber -> ember ramp, brightest slab on top. Dark-tile version.
const MARK_DARK = {
  bottom: { top: '#9a3b0c', left: '#792d08', right: '#5c2206' },
  mid: { top: '#c85c15', left: '#9a3b0c', right: '#792d08' },
  top: { top: '#f5a623', left: '#d97716', right: '#b4590f' },
};
// The porcelain ramp, MARK_LIGHT, was deleted with the porcelain tile. It was a
// deeper ember set that only existed to hold contrast against a pale field, and
// keeping an unused second palette around is how the wrong one gets picked.
// It is in the history if the tile ever goes light again.

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
// 1.25 takes the stack to 295x358 in the 512 unit space. Its furthest vertex sits
// 181 from centre, inside the maskable safe radius (204.8), so the mark stays clear
// of the tile edge.
const MARK_SCALE = 1.25;
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

// --- tile lighting ---------------------------------------------------------
// smoothstep, so the falloff reaches the edge colour without a visible seam.
const smooth = (t) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Interpolated in plain sRGB, deliberately. These are two low-contrast
// neighbours on one hue, so the usual "blend in linear light" argument buys
// nothing, and matching what a CSS gradient would do keeps the SVG below and
// these PNGs identical.
//
// Centred slightly BELOW the tile centre (0.53) and very slightly wider than
// tall, because the stack is taller than it is wide and a circular bloom on
// centre leaves the bottom slab darker than the top one.
const HALO_CX = 0.5, HALO_CY = 0.53, HALO_R = 0.62;
function tileAt(u, v) {
  const d = Math.hypot((u - HALO_CX) * 1.06, (v - HALO_CY) * 0.94) / HALO_R;
  return mix(hex(HALO_CENTRE), hex(HALO_EDGE), smooth(d));
}

// --- render one icon at `size`, supersampled for smooth edges --------------
// `flat` is for the favicons: at 16 and 32 pixels the bloom spans about four
// pixels and is sub-quantisation noise. They get the plain tile, which is also
// what keeps favicon.ico small.
function drawIcon(size, { bg, mark, rounded, flat }) {
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
      if (!flat) col = tileAt(px / hi, py / hi);
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

// --- SVG -------------------------------------------------------------------
// ONE builder, matching the ONE raster set.
//
// The adaptive variant that used to live here is deleted, not commented out. It
// carried `@media (prefers-color-scheme: light)` inside the SVG, and the web
// manifest is an INSTALL icon: that media query resolves ONCE, at the moment the
// app is added, so a dark-mode user installed a graphite tile and a light-mode
// user installed a porcelain one, permanently, with no way to change it after.
// That is the whole bug 9f2544f fixed, and leaving the function in the file as
// dead code is how it comes back.
function buildSvg() {
  // Round on the way out. MARK_SCALE is fractional, so raw coordinates serialise as
  // 123.83999999999997 and the file churns on every regeneration for no visual gain.
  const n = (v) => String(Math.round(v * 100) / 100);
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.map(n).join(',')).join(' ')}" fill="${fill}"/>`;
  const marks = scenePolys(MARK_DARK).map((p) => poly(p.pts, p.color)).join('');
  // Mirrors the raster. An SVG gradient ramps its stops LINEARLY while tileAt
  // falls off on a smoothstep, so sampling the real curve is what keeps the two
  // in step; two stops alone drew a measurably different bloom. Generated from
  // the same constants as the raster so they cannot drift apart.
  const haloStops = [0, 0.25, 0.5, 0.75, 1]
    .map((d) => {
      const c = mix(hex(HALO_CENTRE), hex(HALO_EDGE), smooth(d)).map((x) => Math.round(x));
      return `<stop offset="${d}" stop-color="rgb(${c[0]},${c[1]},${c[2]})"/>`;
    })
    .join('\n      ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="GameDeck">
  <defs>
    <radialGradient id="halo" cx="${HALO_CX}" cy="${HALO_CY}" r="${n(HALO_R)}" gradientTransform="translate(${n(HALO_CX)} ${n(HALO_CY)}) scale(${n(1 / 1.06)} ${n(1 / 0.94)}) translate(${n(-HALO_CX)} ${n(-HALO_CY)})">
      ${haloStops}
    </radialGradient>
  </defs>
  <rect fill="${GRAPHITE}" width="512" height="512" rx="114" ry="114"/>
  <rect fill="url(#halo)" width="512" height="512" rx="114" ry="114"/>
  <g>${marks}</g>
</svg>
`;
}

// --- main ------------------------------------------------------------------
// Bump this whenever the ARTWORK changes. It goes into every icon filename, which
// is the only reliable way to change an app icon that iOS has already seen.
//
// iOS keys its home-screen icon cache on the icon URL and holds it far beyond any
// HTTP cache header: redrawing icon-180.png in place left phones showing the
// original art indefinitely, through re-adds and through a service-worker fix. A new
// URL has no entry in that cache, in the service worker, or on the CDN, so a version
// bump is the change that actually reaches the device. Same reason Vite hashes its
// bundle filenames.
const ICON_VERSION = 'v7';
// Hyphen, not a second dot: one dot, one extension. Nothing should have to guess
// where the extension starts.
const v = (base, ext) => `${base}-${ICON_VERSION}.${ext}`;

function main() {
  const outDir = path.join(__dirname, '..', 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  const written = new Set();
  const write = (name, buf) => {
    fs.writeFileSync(path.join(outDir, name), buf);
    written.add(name);
    console.log(`wrote ${name} (${buf.length} b)`);
  };

  // ONE icon set, graphite, everywhere. Still one set for the reason it always
  // was: iOS cannot select an icon by appearance, so whatever is served is what
  // gets installed, permanently, and a second set only makes "which icon did iOS
  // pick?" unanswerable. Only WHICH one changed.
  //
  // It is graphite rather than porcelain because a porcelain tile is the one
  // bright square on a home screen that is otherwise in dark mode. The earlier
  // argument for porcelain was contrast, that the ember mark reads better on a
  // pale field, and that is true in isolation; the halo is what settles it, by
  // lifting the mark off the graphite without needing a pale tile to do it.
  // The manifest's theme_color and background_color are already #1a1917, so the
  // splash screen now matches the icon as well.
  //
  // No -light in the filename any more. There is one set, so an appearance in
  // the name can only ever be wrong, and it already was: v6 shipped porcelain
  // art in files called -light while the app itself defaults to dark.
  const TILE = { bg: GRAPHITE, mark: MARK_DARK, rounded: false };

  for (const s of [120, 152, 167, 180, 192, 512, 1024]) write(v(`icon-${s}`, 'png'), encodePng(s, s, drawIcon(s, TILE)));

  const favOpts = { bg: GRAPHITE, mark: MARK_DARK, rounded: true, flat: true };
  const fav16 = encodePng(16, 16, drawIcon(16, favOpts));
  const fav32 = encodePng(32, 32, drawIcon(32, favOpts));
  write(v('favicon-16', 'png'), fav16);
  write(v('favicon-32', 'png'), fav32);
  write(v('favicon', 'ico'), encodeIco([{ size: 16, png: fav16 }, { size: 32, png: fav32 }]));

  write(v('icon', 'svg'), Buffer.from(buildSvg(), 'utf8'));

  verifyReferences(written);
}

// A versioned filename is only safe if every consumer moves with it. index.html and
// the manifest are hand-written, so a bump could otherwise ship four dead icon links
// and a silently missing app icon. Fail the BUILD instead: any /icons/... reference
// that was not generated is an error, and any generated icon nobody references is a
// warning (harmless, but usually means a rename was left half done).
function verifyReferences(written) {
  const webDir = path.join(__dirname, '..');
  const indexPath = path.join(webDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  // The manifest is found THROUGH index.html rather than by a hardcoded name. Its url
  // is versioned too, and a hardcoded name here would have gone on silently checking a
  // file nothing links to - which is exactly the failure this guard exists to catch.
  // iOS reads the manifest for the home-screen icon, so a dead link here shows up as a
  // blank letter tile on the phone and nowhere else.
  const manifestHref = (indexHtml.match(/rel="manifest"\s+href="([^"]+)"/) || [])[1];
  if (!manifestHref) throw new Error('index.html has no <link rel="manifest">.');
  const manifestPath = path.join(webDir, 'public', manifestHref.replace(/^\//, ''));
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`index.html links ${manifestHref} but public${manifestHref} does not exist.`);
  }
  // The service worker must not name ANY manifest other than the current one. It now
  // bypasses the manifest entirely, so the correct state is zero references; a leftover
  // name in APP_SHELL is how a phone ends up replaying a manifest full of dead paths.
  const swPath = path.join(webDir, 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, 'utf8');
    const stale = [...sw.matchAll(/[A-Za-z0-9._/-]*\.webmanifest/g)]
      .map((m) => m[0])
      .filter((ref) => !manifestHref.endsWith(ref.replace(/^\//, '')) && ref !== '.webmanifest');
    if (stale.length) {
      throw new Error(`sw.js still references ${[...new Set(stale)].join(', ')}, but the live manifest is ${manifestHref}.`);
    }
  }

  const referenced = new Set();
  for (const text of [indexHtml, fs.readFileSync(manifestPath, 'utf8')]) {
    for (const m of text.matchAll(/\/icons\/([A-Za-z0-9._-]+)/g)) referenced.add(m[1]);
  }
  const missing = [...referenced].filter((f) => !written.has(f));
  if (missing.length) {
    throw new Error(
      `These icons are referenced by index.html or manifest.webmanifest but were not generated: ${missing.join(', ')}. ` +
        `Did ICON_VERSION change without updating them?`
    );
  }
  const orphans = [...written].filter((f) => !referenced.has(f));
  if (orphans.length) console.log(`note: generated but unreferenced: ${orphans.join(', ')}`);
  console.log(`verified ${referenced.size} icon references against ${written.size} generated files`);
}

main();
