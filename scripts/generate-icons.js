#!/usr/bin/env node
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE = path.join(__dirname, '..', 'public', 'ministry-logo.png');
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const SPLASH_DIR = path.join(__dirname, '..', 'public', 'splash');
const BG_COLOR = { r: 10, g: 22, b: 40, alpha: 1 }; // #0a1628

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512]; // These get 20% padding
const APPLE_TOUCH_SIZE = 180;

const SPLASH_SCREENS = [
  { width: 1290, height: 2796, name: 'splash-1290x2796.png' },
  { width: 1170, height: 2532, name: 'splash-1170x2532.png' },
  { width: 750, height: 1334, name: 'splash-750x1334.png' },
];

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.mkdirSync(SPLASH_DIR, { recursive: true });

  const source = sharp(SOURCE);
  const meta = await source.metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  // Generate standard icons
  for (const size of ICON_SIZES) {
    const isMaskable = MASKABLE_SIZES.includes(size);

    if (isMaskable) {
      // Maskable: 80% logo on navy background (20% padding = 10% each side)
      const logoSize = Math.round(size * 0.6);
      const resizedLogo = await sharp(SOURCE)
        .resize(logoSize, logoSize, { fit: 'contain', background: BG_COLOR })
        .png()
        .toBuffer();

      await sharp({
        create: { width: size, height: size, channels: 4, background: BG_COLOR },
      })
        .composite([{
          input: resizedLogo,
          gravity: 'centre',
        }])
        .png()
        .toFile(path.join(ICONS_DIR, `icon-${size}.png`));
    } else {
      await sharp(SOURCE)
        .resize(size, size, { fit: 'contain', background: BG_COLOR })
        .flatten({ background: BG_COLOR })
        .png()
        .toFile(path.join(ICONS_DIR, `icon-${size}.png`));
    }
    console.log(`  ✓ icon-${size}.png${isMaskable ? ' (maskable)' : ''}`);
  }

  // Apple touch icon
  const appleLogoSize = Math.round(APPLE_TOUCH_SIZE * 0.7);
  const appleResized = await sharp(SOURCE)
    .resize(appleLogoSize, appleLogoSize, { fit: 'contain', background: BG_COLOR })
    .png()
    .toBuffer();

  await sharp({
    create: { width: APPLE_TOUCH_SIZE, height: APPLE_TOUCH_SIZE, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: appleResized, gravity: 'centre' }])
    .png()
    .toFile(path.join(ICONS_DIR, 'apple-touch-icon.png'));
  console.log(`  ✓ apple-touch-icon.png (180x180)`);

  // Generate splash screens
  for (const { width, height, name } of SPLASH_SCREENS) {
    const logoSize = Math.round(width * 0.25);
    const resizedLogo = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: BG_COLOR })
      .png()
      .toBuffer();

    // Create text overlay for "DG Work OS"
    const titleFontSize = Math.round(width * 0.05);
    const subtitleFontSize = Math.round(width * 0.025);
    const textY = Math.round(height * 0.5) + Math.round(logoSize * 0.5) + Math.round(height * 0.03);

    const svgText = Buffer.from(`
      <svg width="${width}" height="${height}">
        <text x="${width / 2}" y="${textY}" text-anchor="middle"
          font-family="sans-serif" font-weight="700" font-size="${titleFontSize}" fill="#d4af37">
          DG Work OS
        </text>
        <text x="${width / 2}" y="${textY + titleFontSize + 10}" text-anchor="middle"
          font-family="sans-serif" font-weight="400" font-size="${subtitleFontSize}" fill="rgba(255,255,255,0.5)">
          Ministry of Public Utilities &amp; Aviation
        </text>
      </svg>
    `);

    const logoTop = Math.round(height * 0.5) - Math.round(logoSize * 0.6);

    await sharp({
      create: { width, height, channels: 4, background: BG_COLOR },
    })
      .composite([
        { input: resizedLogo, left: Math.round((width - logoSize) / 2), top: logoTop },
        { input: svgText, left: 0, top: 0 },
      ])
      .png()
      .toFile(path.join(SPLASH_DIR, name));
    console.log(`  ✓ ${name}`);
  }

  console.log('\n✅ All icons and splash screens generated.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
