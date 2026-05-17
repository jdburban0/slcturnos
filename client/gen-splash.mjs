import { Jimp } from 'jimp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Icon size: ~22% of the shorter dimension
const iconSize = (w, h) => Math.round(Math.min(w, h) * 0.22);

// ── Quitar fondo negro de slcicon-raw.png ──────────────────────────────────
// Cualquier píxel con R<60 G<60 B<60 se vuelve transparente
async function loadIconNoBlackBg(imgPath) {
    const img = await Jimp.read(imgPath);
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
        const r = this.bitmap.data[idx + 0];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        if (r < 60 && g < 60 && b < 60) {
            this.bitmap.data[idx + 3] = 0; // transparente
        }
    });
    return img;
}

// ── Generar splashes ───────────────────────────────────────────────────────
async function generateSplashes(icon, bgColor, folder) {
    const outDir = path.join(__dirname, 'public', 'splashes', folder);
    fs.mkdirSync(outDir, { recursive: true });

    for (const { name, w, h } of sizes) {
        const canvas = new Jimp({ width: w, height: h, color: bgColor });
        const size   = iconSize(w, h);
        const resized = icon.clone().resize({ w: size, h: size });
        canvas.composite(resized, Math.round((w - size) / 2), Math.round((h - size) / 2));
        const outPath = path.join(outDir, `${name}.png`);
        await canvas.write(outPath);
        const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
        console.log(`${folder}/${name}.png  ${kb} KB`);
    }
}

// ── Main ───────────────────────────────────────────────────────────────────
const rawPath  = path.join(__dirname, 'public', 'slcicon-raw.png');
const iconPath = path.join(__dirname, 'public', 'slcicon.png');

if (fs.existsSync(rawPath)) {
    console.log('Usando slcicon-raw.png (quitando fondo negro)...');
    const iconNoBg = await loadIconNoBlackBg(rawPath);
    // Dark: azul oscuro (#0f172a) + logo sin fondo negro
    await generateSplashes(iconNoBg, 0x0f172aff, 'dark');
    // Light: blanco + logo normal (slcicon.png ya tiene fondo transparente)
    const iconLight = await Jimp.read(iconPath);
    await generateSplashes(iconLight, 0xffffffff, 'light');
} else {
    console.log('No se encontró slcicon-raw.png — usando slcicon.png para ambos temas...');
    const icon = await Jimp.read(iconPath);
    await generateSplashes(icon, 0x0f172aff, 'dark');
    await generateSplashes(icon, 0xffffffff, 'light');
}

console.log('Done.');
