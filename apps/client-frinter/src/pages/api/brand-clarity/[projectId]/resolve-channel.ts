import type { APIRoute } from 'astro';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function parseYtUrl(input: string): { type: 'id' | 'handle' | 'username'; value: string } | null {
  const raw = input.trim();
  // Direct channel ID (UCxxxxxxx)
  if (/^UC[\w-]{10,}$/.test(raw)) return { type: 'id', value: raw };
  // @handle without URL
  if (raw.startsWith('@')) return { type: 'handle', value: raw.slice(1) };

  try {
    const u = new URL(raw);
    const p = u.pathname;
    const channelMatch = p.match(/^\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };
    const handleMatch = p.match(/^\/@([\w.-]+)/);
    if (handleMatch) return { type: 'handle', value: handleMatch[1] };
    const userMatch = p.match(/^\/(?:c|user)\/([\w.-]+)/);
    if (userMatch) return { type: 'username', value: userMatch[1] };
  } catch {
    // Not a valid URL
  }
  return null;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const YT_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YT_API_KEY) return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), { status: 500, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { url } = body;
  if (!url?.trim()) return new Response(JSON.stringify({ error: 'url required' }), { status: 400, headers: JSON_HEADERS });

  const parsed = parseYtUrl(url);
  if (!parsed) return new Response(JSON.stringify({ error: 'Cannot parse YouTube channel URL or handle' }), { status: 400, headers: JSON_HEADERS });

  const params: Record<string, string> = { part: 'snippet,statistics', key: YT_API_KEY };
  if (parsed.type === 'id') params.id = parsed.value;
  else if (parsed.type === 'handle') params.forHandle = parsed.value;
  else params.forUsername = parsed.value;

  const apiUrl = new URL(`${YT_BASE}/channels`);
  Object.entries(params).forEach(([k, v]) => apiUrl.searchParams.set(k, v));

  const res = await fetch(apiUrl.toString());
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err?.error?.message || `YouTube API ${res.status}` }), { status: 502, headers: JSON_HEADERS });
  }

  const data = await res.json();
  const item = data?.items?.[0];
  if (!item) return new Response(JSON.stringify({ error: 'Channel not found' }), { status: 404, headers: JSON_HEADERS });

  const snippet = item.snippet ?? {};
  const handle = snippet.customUrl ? snippet.customUrl.replace(/^@/, '') : null;

  return new Response(JSON.stringify({
    channelId: item.id,
    channelHandle: handle,
    channelName: snippet.title || item.id,
    channelUrl: handle
      ? `https://www.youtube.com/@${handle}`
      : `https://www.youtube.com/channel/${item.id}`,
    subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
    description: snippet.description ? snippet.description.substring(0, 500) : null,
  }), { headers: JSON_HEADERS });
};
