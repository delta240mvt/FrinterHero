import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderSocialImage } from './src/lib/sh-image-gen.ts';

(async () => {
  const outputDir = resolve('tmp', 'satori');
  mkdirSync(outputDir, { recursive: true });

  const opts = {
    hookLine: "Test hook has some newlines",
    bodyText: "Test body text with some line breaks.",
    hashtags: ["#test", "#satori"],
    templateSlug: "ig-minimal",
    aspectRatio: "3:4"
  };

  const templates = ['retro-quote-card', 'pain-point-story', 'tip-card', 'ig-minimal', 'ig-quote-gradient', 'ig-tip-list'];

  for (const t of templates) {
    console.log(`Testing ${t}...`);
    try {
      const aspectRatio = t.includes('ig') ? '3:4' : (t === 'pain-point-story' ? '9:16' : '1:1');
      const result = await renderSocialImage({ ...opts, templateSlug: t, aspectRatio } as any);
      const outputPath = resolve(outputDir, `${t}.png`);
      writeFileSync(outputPath, result.buffer);
      console.log(`SUCCESS ${t} -> ${outputPath}`);
    } catch(err: any) {
      console.error(`ERROR ${t}:`, err.message);
      process.exitCode = 1;
    }
  }
})();
