// GameDeck app-icon packager.
//
// The v9 artwork is a hand-approved raster master rather than a procedural mark.
// Source assets live in web/assets/icon-v9; this script validates their dimensions,
// copies them into public/icons with cache-busting filenames, and builds favicon.ico.
// It uses only Node built-ins so local and Vercel builds stay deterministic.
'use strict';

const fs = require('fs');
const path = require('path');

const ICON_VERSION = 'v9';
const ICON_SIZES = [120, 152, 167, 180, 192, 512, 1024];
const FAVICON_SIZES = [16, 32];
const v = (base, ext) => `${base}-${ICON_VERSION}.${ext}`;

function pngDimensions(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error(`${label} is not a valid PNG.`);
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${label} does not begin with a PNG IHDR chunk.`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readSizedPng(filePath, expectedSize) {
  const buffer = fs.readFileSync(filePath);
  const { width, height } = pngDimensions(buffer, filePath);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(`${filePath} is ${width}x${height}; expected ${expectedSize}x${expectedSize}.`);
  }
  return buffer;
}

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  const bodies = [];
  let offset = 6 + directory.length;

  entries.forEach(({ size, png }, index) => {
    const base = index * 16;
    directory[base] = size >= 256 ? 0 : size;
    directory[base + 1] = size >= 256 ? 0 : size;
    directory[base + 2] = 0;
    directory[base + 3] = 0;
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += png.length;
    bodies.push(png);
  });

  return Buffer.concat([header, directory, ...bodies]);
}

function verifyReferences(written) {
  const webDir = path.join(__dirname, '..');
  const indexPath = path.join(webDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const manifestHref = (indexHtml.match(/rel="manifest"\s+href="([^"]+)"/) || [])[1];

  if (!manifestHref) throw new Error('index.html has no <link rel="manifest">.');

  const manifestPath = path.join(webDir, 'public', manifestHref.replace(/^\//, ''));
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`index.html links ${manifestHref} but public${manifestHref} does not exist.`);
  }

  const swPath = path.join(webDir, 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, 'utf8');
    const stale = [...sw.matchAll(/[A-Za-z0-9._/-]*\.webmanifest/g)]
      .map((match) => match[0])
      .filter((ref) => !manifestHref.endsWith(ref.replace(/^\//, '')) && ref !== '.webmanifest');
    if (stale.length) {
      throw new Error(
        `sw.js still references ${[...new Set(stale)].join(', ')}, but the live manifest is ${manifestHref}.`,
      );
    }
  }

  const referenced = new Set();
  for (const text of [indexHtml, fs.readFileSync(manifestPath, 'utf8')]) {
    for (const match of text.matchAll(/\/icons\/([A-Za-z0-9._-]+)/g)) referenced.add(match[1]);
  }

  const missing = [...referenced].filter((file) => !written.has(file));
  if (missing.length) {
    throw new Error(
      `These icons are referenced but were not generated: ${missing.join(', ')}. ` +
        'Did ICON_VERSION change without updating index.html and the manifest?',
    );
  }

  const orphans = [...written].filter((file) => !referenced.has(file));
  if (orphans.length) console.log(`note: generated but unreferenced: ${orphans.join(', ')}`);
  console.log(`verified ${referenced.size} icon references against ${written.size} generated files`);
}

function main() {
  const webDir = path.join(__dirname, '..');
  const artworkDir = path.join(webDir, 'assets', `icon-${ICON_VERSION}`);
  const outDir = path.join(webDir, 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  // public/icons is generator-owned and gitignored. Remove only prior generated
  // icon files so stale cache-version assets are not copied into production.
  for (const file of fs.readdirSync(outDir)) {
    if (/^(?:icon|favicon)[-\.]/.test(file)) fs.unlinkSync(path.join(outDir, file));
  }

  const written = new Set();
  const write = (name, buffer) => {
    fs.writeFileSync(path.join(outDir, name), buffer);
    written.add(name);
    console.log(`wrote ${name} (${buffer.length} b)`);
  };

  for (const size of ICON_SIZES) {
    const source = path.join(artworkDir, `icon-${size}.png`);
    write(v(`icon-${size}`, 'png'), readSizedPng(source, size));
  }

  const favicons = FAVICON_SIZES.map((size) => {
    const source = path.join(artworkDir, `favicon-${size}.png`);
    const png = readSizedPng(source, size);
    write(v(`favicon-${size}`, 'png'), png);
    return { size, png };
  });
  write(v('favicon', 'ico'), encodeIco(favicons));

  verifyReferences(written);
}

main();
