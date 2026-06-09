import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-jira-auth, x-jira-url',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Extract plain text from Atlassian Document Format (ADF)
function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text') return n.text ?? '';
  if (n.content) return n.content.map(adfToText).join('');
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const issueUrl = url.searchParams.get('issueUrl');
    const auth = req.headers.get('x-jira-auth'); // base64 email:token

    if (!issueUrl || !auth) {
      return new Response(JSON.stringify({ error: 'Missing issueUrl or auth' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const jiraRes = await fetch(issueUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    if (!jiraRes.ok) {
      const err = await jiraRes.text();
      return new Response(JSON.stringify({ error: err }), {
        status: jiraRes.status, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await jiraRes.json();
    const fields = data.fields ?? {};

    const result = {
      issueKey: data.key,
      summary: fields.summary ?? '',
      description: adfToText(fields.description),
      issueType: fields.issuetype?.name ?? '',
      priority: fields.priority?.name ?? '',
      status: fields.status?.name ?? '',
      assignee: fields.assignee?.displayName ?? '',
      reporter: fields.reporter?.displayName ?? '',
      labels: fields.labels ?? [],
      acceptanceCriteria: fields.customfield_10016 ?? fields.acceptance_criteria ?? '',
    };

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
