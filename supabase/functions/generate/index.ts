import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-mesh-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const meshKey = req.headers.get('x-mesh-key') ?? '';

    if (!meshKey) {
      return new Response(JSON.stringify({ error: 'Missing Mesh API key' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Forward to Mesh API (server-side — no CORS issues)
    const meshRes = await fetch('https://api.meshapi.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${meshKey}`,
      },
      body: JSON.stringify(body),
    });

    // Stream the response back to the client
    return new Response(meshRes.body, {
      status: meshRes.status,
      headers: {
        ...CORS,
        'Content-Type': meshRes.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
