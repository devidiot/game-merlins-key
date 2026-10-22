/**
 * 앱 아이콘 PNG 생성기.
 *
 * 외부 이미지 라이브러리 없이 픽셀을 직접 계산해 PNG로 인코딩한다.
 * 게임 안의 열쇠 도트 그림을 그대로 키워 써서 아이콘과 화면의 인상을 맞춘다.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART, PALETTE } from '../src/render/sprites.ts';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---------------------------------------------------------------- PNG 인코딩

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** RGBA 픽셀 배열(Uint8Array)을 PNG 버퍼로 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 각 행 앞에 필터 바이트(0 = None)를 붙인다
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 그리기

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @param {number} size 픽셀 크기
 * @param {number} contentScale 열쇠가 차지하는 비율 (maskable 은 안전 영역 때문에 작게)
 */
function renderIcon(size, contentScale) {
  const rgba = new Uint8Array(size * size * 4);
  const art = ART.key;
  // 열쇠 그림이 실제로 차지하는 범위만 가운데에 놓는다
  let minX = 16, maxX = 0, minY = 16, maxY = 0;
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  const artW = maxX - minX + 1;
  const artH = maxY - minY + 1;
  const cell = Math.floor((size * contentScale) / Math.max(artW, artH));
  const offX = Math.floor((size - artW * cell) / 2);
  const offY = Math.floor((size - artH * cell) / 2);

  const top = hex('#2a1760');
  const bottom = hex('#0d0820');
  const glow = hex('#8f6cff');

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5) / size - 0.5;
      const ny = (py + 0.5) / size - 0.5;
      let color = mix(top, bottom, clamp01(py / size));
      color = mix(color, glow, clamp01(1 - Math.hypot(nx, ny) * 2.4) * 0.45);

      const ax = Math.floor((px - offX) / cell) + minX;
      const ay = Math.floor((py - offY) / cell) + minY;
      if (px >= offX && py >= offY && ax <= maxX && ay <= maxY) {
        const ch = art[ay]?.[ax] ?? '.';
        if (ch !== '.') color = hex(PALETTE[ch]);
      }

      const i = (py * size + px) * 4;
      rgba[i] = Math.round(color[0]);
      rgba[i + 1] = Math.round(color[1]);
      rgba[i + 2] = Math.round(color[2]);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-180.png', 180, 0.62],
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  // maskable 은 안전 영역(가운데 80%) 안에 내용이 들어가야 한다
  ['icon-512-maskable.png', 512, 0.48],
];

for (const [name, size, scale] of targets) {
  const png = renderIcon(size, scale);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name} (${size}px, ${png.length.toLocaleString()} bytes)`);
}
