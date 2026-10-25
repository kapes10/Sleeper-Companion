// Generates the PWA PNG icons (a simple football on a dark tile) without extra dependencies.
// Run with: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [15, 23, 42];
const BALL = [16, 185, 129];
const LACE = [240, 253, 250];

function pixel(x, y, size) {
  // Normalised coords centred on 0, rotated -35deg so the ball sits diagonally.
  const u = (x + 0.5) / size - 0.5;
  const v = (y + 0.5) / size - 0.5;
  const a = (35 * Math.PI) / 180;
  const rx = u * Math.cos(a) - v * Math.sin(a);
  const ry = u * Math.sin(a) + v * Math.cos(a);
  // Keep artwork inside the maskable safe zone (centre 80%).
  const inBall = (rx / 0.34) ** 2 + (ry / 0.2) ** 2 <= 1;
  if (!inBall) return BG;
  const seam = Math.abs(ry) < 0.012 && Math.abs(rx) < 0.14;
  const laces = [-0.09, -0.045, 0, 0.045, 0.09].some((lx) => Math.abs(rx - lx) < 0.009 && Math.abs(ry) < 0.05);
  return seam || laces ? LACE : BALL;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('icons written');
