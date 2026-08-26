// Generates solid-color splash PNGs for iOS apple-touch-startup-image
// Run: node gen-splash.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32
const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
    }
    return t;
})();
function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcVal]);
}

function solidPNG(w, h, r, g, b) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2; // bit depth 8, RGB

    // Build raw scanlines: filter byte (0) + RGB per pixel
    const row = Buffer.alloc(1 + w * 3);
    row[0] = 0;
    for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }

    // All rows identical — build full raw buffer
    const raw = Buffer.alloc(h * row.length);
    for (let y = 0; y < h; y++) row.copy(raw, y * row.length);

    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Brand blue: #2563eb = rgb(37,99,235)
const R = 37, G = 99, B = 235;

const sizes = [
    { name: 'splash-750x1334',   w: 750,  h: 1334 },  // iPhone SE / 6/7/8
    { name: 'splash-828x1792',   w: 828,  h: 1792 },  // iPhone XR / 11
    { name: 'splash-1125x2436',  w: 1125, h: 2436 },  // iPhone X/XS / 11 Pro / 12 mini
    { name: 'splash-1170x2532',  w: 1170, h: 2532 },  // iPhone 12/13/14
    { name: 'splash-1179x2556',  w: 1179, h: 2556 },  // iPhone 14 Pro / 15 / 16
    { name: 'splash-1242x2688',  w: 1242, h: 2688 },  // iPhone XS Max / 11 Pro Max
    { name: 'splash-1284x2778',  w: 1284, h: 2778 },  // iPhone 12/13 Pro Max / 14 Plus
    { name: 'splash-1290x2796',  w: 1290, h: 2796 },  // iPhone 14 Pro Max / 15 Plus / 16 Plus
    { name: 'splash-1320x2868',  w: 1320, h: 2868 },  // iPhone 16 Pro Max
];

const outDir = path.join(__dirname, 'public', 'splashes');
fs.mkdirSync(outDir, { recursive: true });

for (const { name, w, h } of sizes) {
    const png = solidPNG(w, h, R, G, B);
    fs.writeFileSync(path.join(outDir, `${name}.png`), png);
    console.log(`${name}.png  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log('Done.');
