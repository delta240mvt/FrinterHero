import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'fs';

async function generateFavicons() {
  const svgSource = fs.readFileSync('public/favicon.svg', 'utf-8');

  console.log('🚀 Generuję kwadratowe ikony doğrudan z SVG...');

  const sizes = [
    { size: 16, path: 'public/favicon-16x16.png' },
    { size: 32, path: 'public/favicon-32x32.png' },
    { size: 180, path: 'public/apple-touch-icon.png' },
    { size: 32, path: 'public/favicon.ico' },
  ];

  for (const { size, path } of sizes) {
    const resvg = new Resvg(svgSource, { fitTo: { mode: 'width', value: size } });
    const pngData = resvg.render().asPng();

    if (path.endsWith('.ico')) {
      await sharp(pngData).resize(size, size).png().toFile(path);
    } else {
      fs.writeFileSync(path, pngData);
    }
    console.log(`✓ ${path} (${size}x${size})`);
  }

  console.log('\n✅ Gotowe! Wszystkie ikony są teraz klasycznymi kwadratami.');
}

generateFavicons().catch(err => {
  console.error('\n❌ Błąd:', err);
  process.exit(1);
});
