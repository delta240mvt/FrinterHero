export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, jsonUnauthorized, isAuthenticated, JSON_HEADERS } from '../../lib/internal-api';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  try {
    const formData = await request.formData();
    const folderName = formData.get('folderName')?.toString().trim() || null;
    const files: Array<{ filename: string; content: string }> = [];

    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.name.endsWith('.md')) {
        files.push({
          filename: value.name,
          content: await value.text(),
        });
      }
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'No .md files provided' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { response, data } = await fetchInternalApiJson({
      request,
      pathname: '/v1/admin/knowledge-base/import',
      method: 'POST',
      includeSiteSlug: true,
      body: { folderName, files },
    });

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error('[KB Import API] Error:', { timestamp: new Date().toISOString(), error });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
