import { Jimp } from 'jimp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconPath = path.join(__dirname, 'public', 'slcicon.png');

const sizes = [
    { name: 'splash-750x1334',  w: 750,  h: 1334 },
    { name: 'splash-828x1792',  w: 828,  h: 1792 },
    { name: 'splash-1125x2436', w: 1125, h: 2436 },
    { name: 'splash-1170x2532', w: 1170, h: 2532 },
    { name: 'splash-1179x2556', w: 1179, h: 2556 },
    { name: 'splash-1242x2688', w: 1242, h: 2688 },
    { name: 'splash-1284x2778', w: 1284, h: 2778 },
    { name: 'splash-1290x2796', w: 1290, h: 2796 },
    { name: 'splash-1320x2868', w: 1320, h: 2868 },
];

const themes = [
    { folder: 'light', bg: 0xffffffff },  // blanco
    { folder: 'dark',  bg: 0x0f172aff },  // azul oscuro
];

// Icon size: ~22% of the shorter dimension
const iconSize = (w, h) => Math.round(Math.min(w, h) * 0.22);

const icon = await Jimp.read(iconPath);

for (const { folder, bg } of themes) {
    const outDir = path.join(__dirname, 'public', 'splashes', folder);
    fs.mkdirSync(outDir, { recursive: true });

    for (const { name, w, h } of sizes) {
        const canvas = new Jimp({ width: w, height: h, color: bg });

        const size = iconSize(w, h);
        const resized = icon.clone().resize({ w: size, h: size });

        const x = Math.round((w - size) / 2);
        const y = Math.round((h - size) / 2);

        canvas.composite(resized, x, y);

        const outPath = path.join(outDir, `${name}.png`);
        await canvas.write(outPath);
        const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
        console.log(`${folder}/${name}.png  ${kb} KB`);
    }
}

console.log('Done.');
