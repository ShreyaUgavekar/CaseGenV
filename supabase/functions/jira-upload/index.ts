import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-jira-auth',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { baseUrl, issueKey, auth, filename, csvContent } = await req.json();

    if (!baseUrl || !issueKey || !auth || !csvContent) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 1. Upload CSV as attachment
    const formData = new FormData();
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('file', new File([csvBlob], filename, { type: 'text/csv' }));

    const attachRes = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'X-Atlassian-Token': 'no-check',
      },
      body: formData,
    });

    if (!attachRes.ok) {
      const err = await attachRes.text();
      return new Response(JSON.stringify({ error: `Attachment failed: ${err}` }), {
        status: attachRes.status, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const attachData = await attachRes.json();
    const attachment = Array.isArray(attachData) ? attachData[0] : attachData;
    const downloadUrl = attachment?.content ?? `${baseUrl}/rest/api/3/attachment/content/${attachment?.id}`;

    // 2. Post comment with download link + Google Sheets link
    const sheetsUrl = 'https://docs.google.com/spreadsheets/d/create?usp=pp_url';
    const commentBody = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '🧪 CaseGen', marks: [{ type: 'strong' }] },
              { type: 'text', text: ` generated ` },
              { type: 'text', text: `${attachment?.size ? 'test cases' : 'test cases'}`, marks: [{ type: 'strong' }] },
              { type: 'text', text: ' and attached the CSV to this ticket.' },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '📎 Download CSV: ' },
              { type: 'text', text: filename, marks: [{ type: 'link', attrs: { href: downloadUrl } }] },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '📊 Open in Google Sheets: ' },
              {
                type: 'text',
                text: 'Click → File → Import → Upload the CSV above',
                marks: [{ type: 'link', attrs: { href: sheetsUrl } }],
              },
            ],
          },
        ],
      },
    };

    const commentRes = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(commentBody),
    });

    if (!commentRes.ok) {
      const err = await commentRes.text();
      return new Response(JSON.stringify({ error: `Comment failed: ${err}` }), {
        status: commentRes.status, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, downloadUrl, ticketUrl: `${baseUrl}/browse/${issueKey}` }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
