/**
 * sh-image-gen.ts — SocialHub Image Generator using Satori.
 *
 * Converts HTML string templates to Satori-compatible VDOM via satori-html,
 * renders to SVG with Satori, and rasterises to PNG with @resvg/resvg-js.
 *
 * Templates:
 *   retro-quote-card   (1:1)   — dark + gold border
 *   pain-point-story   (9:16)  — dark gradient
 *   tip-card           (1:1)   — teal PRO TIP badge
 *   ig-minimal         (3:4)   — minimal dark, IG portrait
 *   ig-quote-gradient  (3:4)   — dramatic gradient quote
 *   ig-tip-list        (3:4)   — numbered tip list
 */

import type { SatoriOptions } from 'satori';
import type { ResvgRenderOptions } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let satoriFn: ((vdom: unknown, opts: SatoriOptions) => Promise<string>) | null = null;
let htmlFn: ((markup: string) => unknown) | null = null;
let ResvgClass: (new (svg: string, opts?: ResvgRenderOptions | null) => { render(): { asPng(): Uint8Array } }) | null = null;

async function loadDeps(): Promise<void> {
  if (satoriFn && htmlFn && ResvgClass) return;

  try {
    const satoriMod = await import('satori');
    satoriFn = satoriMod.default as typeof satoriFn;
  } catch {
    throw new Error('[sh-image-gen] "satori" package is not installed. Run: npm install satori');
  }

  try {
    const htmlMod = await import('satori-html');
    htmlFn = (htmlMod.html ?? htmlMod.default) as typeof htmlFn;
  } catch {
    throw new Error('[sh-image-gen] "satori-html" package is not installed. Run: npm install satori-html');
  }

  try {
    const resvgMod = await import('@resvg/resvg-js');
    ResvgClass = (resvgMod.Resvg ?? resvgMod.default) as typeof ResvgClass;
  } catch {
    throw new Error('[sh-image-gen] "@resvg/resvg-js" package is not installed. Run: npm install @resvg/resvg-js');
  }
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SocialImageOptions {
  hookLine: string;
  bodyText: string;
  hashtags: string[];
  templateSlug: string;
  aspectRatio: '1:1' | '9:16' | '16:9' | '3:4';
  brandColors?: {
    teal: string;
    violet: string;
    gold: string;
    bg: string;
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
  '3:4':  { w: 1080, h: 1350 },  // IG portrait — recommended
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
// Template builders
// ---------------------------------------------------------------------------

function buildRetroBCard(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:${c.bg};display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px;font-family:'Poppins', sans-serif;">
    <div style="border:3px solid ${c.gold};padding:60px;display:flex;flex-direction:column;gap:40px;width:100%;box-sizing:border-box;">
      <div style="font-size:52px;font-weight:700;color:${c.gold};line-height:1.2;">${opts.hookLine}</div>
      <div style="font-size:30px;font-weight:500;color:#e2e8f0;line-height:1.6;">${opts.bodyText.slice(0, 220)}</div>
      <div style="font-size:22px;color:${c.teal};">${opts.hashtags.slice(0, 5).join(' ')}</div>
    </div>
  </div>`;
}

function buildPainPointStory(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:linear-gradient(180deg,${c.bg} 0%,#0f172a 100%);display:flex;flex-direction:column;justify-content:space-between;padding:100px 80px;font-family:'Poppins', sans-serif;">
    <div style="color:${c.teal};font-size:26px;font-weight:500;letter-spacing:4px;">PAIN POINT</div>
    <div style="display:flex;flex-direction:column;gap:48px;">
      <div style="font-size:68px;font-weight:700;color:white;line-height:1.1;">${opts.hookLine}</div>
      <div style="font-size:34px;font-weight:400;color:#94a3b8;line-height:1.5;">${opts.bodyText.slice(0, 160)}</div>
    </div>
    <div style="color:${c.violet};font-size:24px;">${opts.hashtags.slice(0, 3).join(' ')}</div>
  </div>`;
}

function buildTipCard(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:${c.bg};display:flex;flex-direction:column;padding:80px;font-family:'Poppins', sans-serif;">
    <div style="background:${c.teal};color:white;font-size:22px;font-weight:600;padding:12px 24px;border-radius:6px;align-self:flex-start;margin-bottom:48px;">PRO TIP</div>
    <div style="font-size:54px;font-weight:700;color:white;line-height:1.2;flex:1;">${opts.hookLine}</div>
    <div style="font-size:28px;color:#94a3b8;margin-top:40px;">${opts.bodyText.slice(0, 200)}</div>
    <div style="color:${c.gold};font-size:20px;margin-top:32px;">${opts.hashtags.slice(0, 4).join(' ')}</div>
  </div>`;
}

// ── IG 3:4 — Minimal Dark ──────────────────────────────────────────────────
function buildIgMinimal(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:#0d1117;display:flex;flex-direction:column;justify-content:space-between;padding:96px 80px;font-family:'Poppins', sans-serif;">
    <div style="display:flex;align-items:center;gap:16px;">
      <div style="width:48px;height:4px;background:${c.teal};border-radius:2px;"></div>
      <div style="font-size:20px;color:${c.teal};font-weight:500;letter-spacing:3px;">FRINTER</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:40px;">
      <div style="font-size:62px;font-weight:700;color:#f8fafc;line-height:1.15;">${opts.hookLine.slice(0, 80)}</div>
      <div style="width:64px;height:3px;background:${c.gold};border-radius:2px;"></div>
      <div style="font-size:30px;color:#94a3b8;line-height:1.65;">${opts.bodyText.slice(0, 300)}</div>
    </div>
    <div style="font-size:20px;color:${c.violet};">${opts.hashtags.slice(0, 5).join('  ')}</div>
  </div>`;
}

// ── IG 3:4 — Gradient Quote ────────────────────────────────────────────────
function buildIgQuoteGradient(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  return `<div style="width:${w}px;height:${h}px;background:linear-gradient(135deg,${c.bg} 0%,#1a0b2e 50%,#0f2027 100%);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:80px;font-family:'Poppins', sans-serif;text-align:center;">
    <div style="font-size:140px;color:${c.violet};opacity:0.2;line-height:0.7;margin-bottom:32px;">"</div>
    <div style="font-size:58px;font-weight:700;color:white;line-height:1.2;margin-bottom:48px;">${opts.hookLine.slice(0, 100)}</div>
    <div style="display:flex;align-items:center;gap:24px;margin-bottom:40px;">
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.15);"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:${c.gold};"></div>
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.15);"></div>
    </div>
    <div style="font-size:28px;color:#94a3b8;line-height:1.6;max-width:900px;">${opts.bodyText.slice(0, 180)}</div>
    <div style="margin-top:60px;font-size:22px;color:${c.teal};">${opts.hashtags.slice(0, 4).join('  ')}</div>
  </div>`;
}

// ── IG 3:4 — Tip List ─────────────────────────────────────────────────────
function buildIgTipList(opts: SocialImageOptions, w: number, h: number): string {
  const c = { ...DEFAULT_COLORS, ...opts.brandColors };
  const sentences = opts.bodyText
    .replace(/\n/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)
    .slice(0, 3);

  const tipRows = sentences.length > 0
    ? sentences.map((s, i) =>
        `<div style="display:flex;align-items:flex-start;gap:24px;">
          <div style="background:${c.teal};color:white;font-size:22px;font-weight:600;min-width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${i + 1}</div>
          <div style="font-size:28px;font-weight:400;color:#e2e8f0;line-height:1.5;">${s}</div>
        </div>`
      ).join('')
    : `<div style="font-size:30px;color:#94a3b8;line-height:1.6;">${opts.bodyText.slice(0, 300)}</div>`;

  return `<div style="width:${w}px;height:${h}px;background:${c.bg};display:flex;flex-direction:column;padding:80px;font-family:'Poppins', sans-serif;">
    <div style="margin-bottom:56px;">
      <div style="font-size:20px;font-weight:500;color:${c.gold};letter-spacing:4px;margin-bottom:20px;">QUICK WINS</div>
      <div style="font-size:54px;font-weight:700;color:white;line-height:1.15;">${opts.hookLine.slice(0, 60)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:36px;flex:1;">${tipRows}</div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:28px;margin-top:40px;font-size:20px;color:${c.teal};">${opts.hashtags.slice(0, 5).join('  ')}</div>
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
    case 'pain-point-story':    htmlContent = buildPainPointStory(opts, w, h); break;
    case 'tip-card':            htmlContent = buildTipCard(opts, w, h); break;
    case 'ig-minimal':          htmlContent = buildIgMinimal(opts, w, h); break;
    case 'ig-quote-gradient':   htmlContent = buildIgQuoteGradient(opts, w, h); break;
    case 'ig-tip-list':         htmlContent = buildIgTipList(opts, w, h); break;
    default:                    htmlContent = buildRetroBCard(opts, w, h);
  }

  const vdom = htmlFn!(htmlContent);

  const fontOptions: SatoriOptions['fonts'] = [];
  try {
    fontOptions.push({
      name: 'Poppins',
      data: readFileSync(resolve(process.cwd(), 'public/fonts/Poppins-400.woff2')),
      weight: 400,
      style: 'normal',
    });
  } catch (e) {
    // fallback or fail gracefully
  }
  try {
    fontOptions.push({
      name: 'Poppins',
      data: readFileSync(resolve(process.cwd(), 'public/fonts/Poppins-500.woff2')),
      weight: 500,
      style: 'normal',
    });
  } catch(e) {}
  try {
    fontOptions.push({
      name: 'Poppins',
      data: readFileSync(resolve(process.cwd(), 'public/fonts/Poppins-600.woff2')),
      weight: 600,
      style: 'normal',
    });
  } catch(e) {}
  try {
    fontOptions.push({
      name: 'Poppins',
      data: readFileSync(resolve(process.cwd(), 'public/fonts/Poppins-700.woff2')),
      weight: 700,
      style: 'normal',
    });
  } catch(e) {}

  const svg = await satoriFn!(vdom, {
    width: w,
    height: h,
    fonts: fontOptions,
  });

  const resvg = new ResvgClass!(svg, { fitTo: { mode: 'width', value: w } });
  const buffer = Buffer.from(resvg.render().asPng());

  return { buffer, width: w, height: h, mimeType: 'image/png' };
}

// ---------------------------------------------------------------------------
// Default template seed data for shTemplates DB table
// ---------------------------------------------------------------------------

export function getDefaultTemplates() {
  const mk = (slug: string, aspect: SocialImageOptions['aspectRatio']) =>
    ({ hookLine: '{{hookLine}}', bodyText: '{{bodyText}}', hashtags: ['{{hashtags}}'], templateSlug: slug, aspectRatio: aspect } satisfies SocialImageOptions);

  const sq   = DIMENSIONS['1:1'];
  const vert = DIMENSIONS['9:16'];
  const ig   = DIMENSIONS['3:4'];

  return [
    { name: 'Retro Quote Card',   slug: 'retro-quote-card',  category: 'quote',       aspectRatio: '1:1'  as const, jsxTemplate: buildRetroBCard(mk('retro-quote-card', '1:1'), sq.w, sq.h) },
    { name: 'Pain Point Story',   slug: 'pain-point-story',  category: 'pain_point',  aspectRatio: '9:16' as const, jsxTemplate: buildPainPointStory(mk('pain-point-story', '9:16'), vert.w, vert.h) },
    { name: 'Tip Card',           slug: 'tip-card',          category: 'tip',         aspectRatio: '1:1'  as const, jsxTemplate: buildTipCard(mk('tip-card', '1:1'), sq.w, sq.h) },
    { name: 'IG Minimal Dark',    slug: 'ig-minimal',        category: 'ig_portrait', aspectRatio: '3:4'  as const, jsxTemplate: buildIgMinimal(mk('ig-minimal', '3:4'), ig.w, ig.h) },
    { name: 'IG Quote Gradient',  slug: 'ig-quote-gradient', category: 'ig_portrait', aspectRatio: '3:4'  as const, jsxTemplate: buildIgQuoteGradient(mk('ig-quote-gradient', '3:4'), ig.w, ig.h) },
    { name: 'IG Tip List',        slug: 'ig-tip-list',       category: 'ig_portrait', aspectRatio: '3:4'  as const, jsxTemplate: buildIgTipList(mk('ig-tip-list', '3:4'), ig.w, ig.h) },
  ];
}
