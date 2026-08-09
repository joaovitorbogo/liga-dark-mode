// Gera os PNGs do icone sem dependencias: uma carta laranja de pe, com um
// recorte de lua no canto superior direito -- "modo escuro para um site de
// cartas". Uso: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Amostragem 4x4 por pixel para as bordas nao ficarem serrilhadas.
const SS = 4;

/** Distancia assinada ate um retangulo de cantos arredondados. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  // Ladrilho quase full-bleed: a 16px um contorno fino de carta viraria papa,
  // entao a forma que carrega o icone e a lua recortada, nao a moldura.
  const h = size * 0.455;
  const r = size * 0.22;
  // Crescente: disco cheio menos um disco deslocado para a direita e para cima.
  const lr = size * 0.30;
  const lx = cx - size * 0.035, ly = cy + size * 0.02;
  const cutR = size * 0.275;
  const cutX = lx + size * 0.155, cutY = ly - size * 0.115;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const noTile = sdRoundRect(px, py, cx, cy, h, h, r) <= 0;
          const naLua = (px - lx) ** 2 + (py - ly) ** 2 <= lr ** 2 &&
                        (px - cutX) ** 2 + (py - cutY) ** 2 > cutR ** 2;
          if (noTile && !naLua) {
            // Degrade vertical do laranja da marca do ligamagic (#ff5a00).
            const t = Math.min(1, Math.max(0, py / size));
            acc[0] += 255;
            acc[1] += 122 - t * 40;
            acc[2] += 40 - t * 40;
            acc[3] += 255;
          }
        }
      }
      const n = SS * SS;
      const a = acc[3] / n;
      const i = (y * size + x) * 4;
      if (a > 0) {
        // acc de cor foi somado so nas amostras opacas; normaliza por elas.
        const opaque = acc[3] / 255;
        buf[i] = Math.round(acc[0] / opaque);
        buf[i + 1] = Math.round(acc[1] / opaque);
        buf[i + 2] = Math.round(acc[2] / opaque);
        buf[i + 3] = Math.round(a);
      }
    }
  }
  return buf;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(file, encodePNG(size, draw(size)));
  console.log(`${file} (${fs.statSync(file).size} bytes)`);
}
