/**
 * sh-image-gen.ts — SocialHub Image Generator using Satori.
 *
 * Converts HTML string templates to Satori-compatible VDOM via satori-html,
 * renders to SVG with Satori, and rasterises to PNG with @resvg/resvg-js.
 *
 * Three built-in templates:
 *  - retro-quote-card  (1:1)
 *  - pain-point-story  (9:16)
 *  - tip-card          (1:1)
 *
 * Dependencies (install separately):
 *   npm install satori @resvg/resvg-js satori-html
 */

let satoriFn: ((vdom: unknown, opts: unknown) => Promise<string>) | null = null;
let htmlFn: ((markup: string) => unknown) | null = null;
let ResvgClass: (new (svg: string, opts?: unknown) => { render(): { asPng(): Uint8Array } }) | null = null;

async function loadDeps(): Promise<void> {
  if (satoriFn && htmlFn && ResvgClass) return;

  try {
    const satoriMod = await import('satori');
    satoriFn = satoriMod.default ?? satoriMod;
  } catch {
    throw new Error(
      '[sh-image-gen] "satori" package is not installed. Run: npm install satori'
    );
  }

  try {
    const htmlMod = await import('satori-html');
    htmlFn = htmlMod.html ?? htmlMod.default;
  } catch {
    throw new Error(
      '[sh-image-gen] "satori-html" package is not installed. Run: npm install satori-html'
    );
  }

  try {
    const resvgMod = await import('@resvg/resvg-js');
    ResvgClass = resvgMod.Resvg ?? resvgMod.default;
  } catch {
    throw new Error(
      '[sh-image-gen] "@resvg/resvg-js" package is not installed. Run: npm install @resvg/resvg-js'
    );
  }
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SocialImageOptions {
  hookLine: string;
  bodyText: string;
  hashtags: string[];
  templateSlug: string; // 'retro-quote-card' | 'pain-point-story' | 'tip-card'
  aspectRatio: '1:1' | '9:16' | '16:9';
  brandColors?: {
    teal: string;   // default '#4a8d83'
    violet: string; // default '#8a4e64'
    gold: string;   // default '#d6b779'
    bg: string;     // default '#1e293b'
  };
}

export interface SocialImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png';
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const DIMENSIONS: Record<string, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1280, h: 720  },
};

// ---------------------------------------------------------------------------
// Default brand colors
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = {
  teal:   '#4a8d83',
  violet: '#8a4e64',
  gold:   '#d6b779',
  bg:     '#1e293b',
};

// ---------------------------------------------------------------------------
// Template HTML builders
// ---------------------------------------------------------------------------

function buildRetroBCard(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:${c.bg};display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px;font-family:sans-serif;">
    <div style="border:3px solid ${c.gold};padding:60px;display:flex;flex-direction:column;gap:40px;width:100%;box-sizing:border-box;">
      <div style="font-size:52px;font-weight:800;color:${c.gold};line-height:1.2;">${opts.hookLine}</div>
      <div style="font-size:32px;color:#e2e8f0;line-height:1.6;">${opts.bodyText.slice(0, 200)}</div>
      <div style="font-size:24px;color:${c.teal};">${opts.hashtags.slice(0, 5).join(' ')}</div>
    </div>
  </div>`;
}

function buildPainPointStory(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:linear-gradient(180deg,${c.bg} 0%,#0f172a 100%);display:flex;flex-direction:column;justify-content:space-between;padding:100px 80px;font-family:sans-serif;">
    <div style="color:${c.teal};font-size:28px;font-weight:600;letter-spacing:4px;">PAIN POINT</div>
    <div style="display:flex;flex-direction:column;gap:48px;">
      <div style="font-size:72px;font-weight:900;color:white;line-height:1.1;">${opts.hookLine}</div>
      <div style="font-size:36px;color:#94a3b8;line-height:1.5;">${opts.bodyText.slice(0, 150)}</div>
    </div>
    <div style="color:${c.violet};font-size:26px;">${opts.hashtags.slice(0, 3).join(' ')}</div>
  </div>`;
}

function buildTipCard(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:${c.bg};display:flex;flex-direction:column;padding:80px;font-family:sans-serif;">
    <div style="background:${c.teal};color:white;font-size:24px;font-weight:700;padding:12px 24px;border-radius:6px;align-self:flex-start;margin-bottom:48px;">PRO TIP</div>
    <div style="font-size:58px;font-weight:800;color:white;line-height:1.2;flex:1;">${opts.hookLine}</div>
    <div style="font-size:30px;color:#94a3b8;margin-top:40px;">${opts.bodyText.slice(0, 180)}</div>
    <div style="color:${c.gold};font-size:22px;margin-top:32px;">${opts.hashtags.slice(0, 4).join(' ')}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Core renderer
// ---------------------------------------------------------------------------

export async function renderSocialImage(opts: SocialImageOptions): Promise<SocialImageResult> {
  await loadDeps();

  const { w, h } = DIMENSIONS[opts.aspectRatio] ?? DIMENSIONS['1:1'];

  let htmlContent: string;
  switch (opts.templateSlug) {
    case 'pain-point-story':
      htmlContent = buildPainPointStory(opts, w, h);
      break;
    case 'tip-card':
      htmlContent = buildTipCard(opts, w, h);
      break;
    default:
      htmlContent = buildRetroBCard(opts, w, h);
  }

  const vdom = htmlFn!(htmlContent);

  const svg = await satoriFn!(vdom, {
    width: w,
    height: h,
    fonts: [], // no custom fonts required — system sans-serif
  });

  const resvg = new ResvgClass!(svg, { fitTo: { mode: 'width', value: w } });
  const buffer = Buffer.from(resvg.render().asPng());

  return { buffer, width: w, height: h, mimeType: 'image/png' };
}

// ---------------------------------------------------------------------------
// Default template seed data for shTemplates DB table
// ---------------------------------------------------------------------------

export function getDefaultTemplates() {
  const baseOpts = (slug: string, aspect: SocialImageOptions['aspectRatio']) =>
    ({
      hookLine: '{{hookLine}}',
      bodyText: '{{bodyText}}',
      hashtags: ['{{hashtags}}'],
      templateSlug: slug,
      aspectRatio: aspect,
    } satisfies SocialImageOptions);

  const sq = DIMENSIONS['1:1'];
  const vert = DIMENSIONS['9:16'];

  return [
    {
      name: 'Retro Quote Card',
      slug: 'retro-quote-card',
      category: 'quote',
      aspectRatio: '1:1' as const,
      jsxTemplate: buildRetroBCard(baseOpts('retro-quote-card', '1:1'), sq.w, sq.h),
    },
    {
      name: 'Pain Point Story',
      slug: 'pain-point-story',
      category: 'pain_point',
      aspectRatio: '9:16' as const,
      jsxTemplate: buildPainPointStory(baseOpts('pain-point-story', '9:16'), vert.w, vert.h),
    },
    {
      name: 'Tip Card',
      slug: 'tip-card',
      category: 'tip',
      aspectRatio: '1:1' as const,
      jsxTemplate: buildTipCard(baseOpts('tip-card', '1:1'), sq.w, sq.h),
    },
  ];
}
