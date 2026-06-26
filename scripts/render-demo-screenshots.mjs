#!/usr/bin/env node

import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "../src/io.mjs";

const usage = `
Render demo screenshots

Usage:
  node scripts/render-demo-screenshots.mjs --out docs/assets/screenshots

Creates static PNG assets from generated package artifacts. These are demo
evidence boards for public docs, not captured Forward product screenshots.
`;

const WIDTH = 1440;
const HEIGHT = 900;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  const out = args.out || "docs/assets/screenshots";
  await mkdir(out, { recursive: true });

  const report = await readJson("dist/forward-kentik-report.json");
  const manifest = await readJson("dist/forward-kentik-manifest.json");
  const checks = await readJson("dist/forward-intent-checks.json");
  const flows = await readJson("dist/observed-flows.json");

  const screenshots = [
    {
      file: "01-workflow-overview.png",
      title: "Kentik Evidence to Forward Intent Checks",
      subtitle: "Offline Forward field integration workflow",
      metric: `${flows.length} observed flows`,
      panels: [
        ["1. Collect", "Kentik Query API, portal demo seed, or JSON fixture"],
        ["2. Normalize", "Provider-neutral observed flow schema"],
        ["3. Generate", `${checks.length} Forward NewNetworkCheck objects`],
        ["4. Import", "Dry-run first, then create missing checks only"],
      ],
    },
    {
      file: "02-package-readiness.png",
      title: "Generated Package Readiness",
      subtitle: manifest.packageId,
      metric: `${checks.length} checks ready`,
      panels: [
        ["Manifest", `${manifest.schemaVersion}; ${manifest.packageType}`],
        ["Artifacts", Object.values(manifest.artifacts).join(", ")],
        ["Skipped", `${report.skipped.length} rows need review`],
        ["Reconcile Key", manifest.reconciliation.requiredTagPrefix],
      ],
    },
    {
      file: "03-forward-import-dry-run.png",
      title: "Forward Import Dry Run",
      subtitle: "Default mode makes no Forward changes",
      metric: "create-missing-only",
      panels: [
        ["Validate", "Package shape, tag uniqueness, manifest age"],
        ["Resolve Snapshot", "GET /api/networks/{networkId}/snapshots/latestProcessed"],
        ["Read Existing", "GET /api/snapshots/{snapshotId}/checks?type=Existential"],
        ["Report", "create, unchanged, changed, stale"],
      ],
    },
    {
      file: "04-optional-nqe-visibility.png",
      title: "Optional NQE Visibility",
      subtitle: "Data Connector is secondary; intent checks stay offline import",
      metric: "not the main path",
      panels: [
        ["Observed Flows", "Serve observed-flows.json when useful"],
        ["Data Connector", "HTTP GET brings data into NQE"],
        ["Boundary", "NQE visibility does not create intent checks"],
        ["Primary Path", "Use forward:import for intent onboarding"],
      ],
    },
  ];

  for (const screenshot of screenshots) {
    await writePng(path.join(out, screenshot.file), renderBoard(screenshot));
  }

  process.stdout.write(`${JSON.stringify({ out, count: screenshots.length }, null, 2)}\n`);
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const renderBoard = ({ title, subtitle, metric, panels }) => {
  const canvas = new RgbaCanvas(WIDTH, HEIGHT, [247, 249, 252, 255]);
  canvas.rect(0, 0, WIDTH, 96, [18, 28, 45, 255]);
  canvas.text(64, 34, "FORWARD FIELD INTEGRATION", 18, [167, 205, 255, 255]);
  canvas.text(64, 88, title, 40, [255, 255, 255, 255]);
  canvas.text(64, 142, subtitle, 22, [72, 84, 101, 255]);

  canvas.roundRect(1068, 124, 280, 92, 8, [255, 255, 255, 255], [207, 216, 228, 255]);
  canvas.text(1098, 160, "STATUS", 16, [90, 103, 121, 255]);
  canvas.text(1098, 198, metric, 26, [22, 119, 91, 255]);

  const startX = 64;
  const startY = 250;
  const gap = 28;
  const cardWidth = 636;
  const cardHeight = 154;
  panels.forEach(([heading, body], index) => {
    const x = startX + (index % 2) * (cardWidth + gap);
    const y = startY + Math.floor(index / 2) * (cardHeight + gap);
    canvas.roundRect(x, y, cardWidth, cardHeight, 8, [255, 255, 255, 255], [211, 219, 230, 255]);
    canvas.rect(x, y, 8, cardHeight, index % 2 === 0 ? [32, 116, 181, 255] : [22, 139, 115, 255]);
    canvas.text(x + 34, y + 48, heading, 26, [28, 39, 56, 255]);
    wrapText(canvas, body, x + 34, y + 88, 18, 54, [82, 95, 113, 255]);
  });

  const footerHash = createHash("sha256").update(JSON.stringify({ title, panels })).digest("hex").slice(0, 12);
  canvas.text(64, 840, `Generated from repository artifacts. board=${footerHash}`, 16, [95, 109, 128, 255]);
  return canvas;
};

const wrapText = (canvas, text, x, y, size, maxChars, color) => {
  const words = text.split(/\s+/);
  let line = "";
  let offset = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      canvas.text(x, y + offset, line, size, color);
      line = word;
      offset += Math.round(size * 1.45);
    } else {
      line = next;
    }
  }
  if (line) {
    canvas.text(x, y + offset, line, size, color);
  }
};

class RgbaCanvas {
  constructor(width, height, background) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    this.rect(0, 0, width, height, background);
  }

  rect(x, y, width, height, color) {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(this.width, Math.ceil(x + width));
    const endY = Math.min(this.height, Math.ceil(y + height));
    for (let py = startY; py < endY; py += 1) {
      for (let px = startX; px < endX; px += 1) {
        this.pixel(px, py, color);
      }
    }
  }

  roundRect(x, y, width, height, radius, fill, stroke) {
    this.rect(x + radius, y, width - radius * 2, height, fill);
    this.rect(x, y + radius, width, height - radius * 2, fill);
    this.circleCorner(x + radius, y + radius, radius, fill, "tl");
    this.circleCorner(x + width - radius - 1, y + radius, radius, fill, "tr");
    this.circleCorner(x + radius, y + height - radius - 1, radius, fill, "bl");
    this.circleCorner(x + width - radius - 1, y + height - radius - 1, radius, fill, "br");
    if (stroke) {
      this.rect(x + radius, y, width - radius * 2, 1, stroke);
      this.rect(x + radius, y + height - 1, width - radius * 2, 1, stroke);
      this.rect(x, y + radius, 1, height - radius * 2, stroke);
      this.rect(x + width - 1, y + radius, 1, height - radius * 2, stroke);
    }
  }

  circleCorner(cx, cy, radius, color, corner) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }
        if (corner === "tl" && (dx > 0 || dy > 0)) continue;
        if (corner === "tr" && (dx < 0 || dy > 0)) continue;
        if (corner === "bl" && (dx > 0 || dy < 0)) continue;
        if (corner === "br" && (dx < 0 || dy < 0)) continue;
        this.pixel(cx + dx, cy + dy, color);
      }
    }
  }

  text(x, y, value, size, color) {
    drawText(this, Math.floor(x), Math.floor(y - size), String(value), size, color);
  }

  pixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    const index = (y * this.width + x) * 4;
    this.data[index] = color[0];
    this.data[index + 1] = color[1];
    this.data[index + 2] = color[2];
    this.data[index + 3] = color[3];
  }
}

const drawText = (canvas, x, y, text, size, color) => {
  const scale = Math.max(2, Math.round(size / 8));
  let cursor = x;
  for (const rawChar of text.toUpperCase()) {
    if (rawChar === " ") {
      cursor += 4 * scale;
      continue;
    }
    const glyph = FONT[rawChar] || FONT["?"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          canvas.rect(cursor + column * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
};

const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  ",": ["0", "0", "0", "0", "0", "1", "1"],
  ":": ["0", "1", "0", "0", "0", "1", "0"],
  ";": ["0", "1", "0", "0", "0", "1", "1"],
  "-": ["0", "0", "0", "111", "0", "0", "0"],
  "_": ["0", "0", "0", "0", "0", "0", "11111"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "{": ["0011", "0100", "0100", "1000", "0100", "0100", "0011"],
  "}": ["1100", "0010", "0010", "0001", "0010", "0010", "1100"],
  "*": ["00100", "10101", "01110", "11111", "01110", "10101", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "(": ["001", "010", "100", "100", "100", "010", "001"],
  ")": ["100", "010", "001", "001", "001", "010", "100"],
};

const crcTable = (() => {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunkBuffer = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const zlibDeflateSync = async (buffer) => {
  const { deflateSync } = await import("node:zlib");
  return deflateSync(buffer);
};

const writePng = async (filePath, canvas) => {
  const scanlines = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * (canvas.width * 4 + 1);
    scanlines[rowStart] = 0;
    canvas.data.copy(scanlines, rowStart + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkBuffer("IHDR", header),
    chunkBuffer("IDAT", await zlibDeflateSync(scanlines)),
    chunkBuffer("IEND", Buffer.alloc(0)),
  ]);
  await mkdir(path.dirname(filePath), { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, png));
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
