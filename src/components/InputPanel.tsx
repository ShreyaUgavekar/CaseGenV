import { useState, useMemo } from 'react';
import type { InputMode } from '../types';
import type { JiraContext } from '../App';
import { edgeFunctionUrl, edgeFunctionHeaders } from '../api/supabase';

const TEST_TYPES = ['Functional', 'UI', 'Edge Case', 'Negative', 'Performance', 'Security', 'Integration', 'Regression'];

interface Props {
  onGenerate: (input: string, apiKey: string, model: string, jira?: JiraContext, tcCount?: string, tcTypes?: string[]) => void;
  isLoading: boolean;
}

function estimateTestCases(text: string): { count: number; breakdown: string[] } {
  if (!text.trim()) return { count: 0, breakdown: [] };
  const lower = text.toLowerCase();
  const breakdown: string[] = [];
  const featureKeywords = ['verify','check','validate','ensure','test','confirm','should','must','when','if ','allow','restrict','enable','disable'];
  const scenarioMatches = featureKeywords.reduce((acc, kw) => acc + (lower.match(new RegExp(`\\b${kw}\\b`, 'g')) ?? []).length, 0);
  const roles = ['admin','user','creator','subscriber','manager','guest','operator'];
  const roleCount = roles.filter(r => lower.includes(r)).length;
  if (roleCount > 0) breakdown.push(`${roleCount} role${roleCount > 1 ? 's' : ''}`);
  const sections = (text.match(/\n#{1,3}\s+/g) ?? []).length || (text.match(/\n\d+\.\s+/g) ?? []).length;
  if (sections > 0) breakdown.push(`${sections} section${sections > 1 ? 's' : ''}`);
  const acLines = (text.match(/\n[-*•]\s+/g) ?? []).length;
  if (acLines > 0) breakdown.push(`${acLines} criteria`);
  const total = Math.min(5 + Math.min(Math.floor(scenarioMatches / 3), 5) + Math.min(roleCount, 2) + Math.min(sections, 2) + Math.min(Math.floor(acLines / 2), 3), 10);
  return { count: total, breakdown };
}

// Parse Jira base URL and issue key from a ticket URL
function parseJiraUrl(url: string): { baseUrl: string; issueKey: string } | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (!match) return null;
    return { baseUrl: u.origin, issueKey: match[1].toUpperCase() };
  } catch {
    return null;
  }
}

function JiraTokenTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="tooltip-wrap">
      <button className="info-btn" onClick={() => setOpen(v => !v)} title="How to get a Jira API token">ⓘ</button>
      {open && (
        <div className="tooltip-box">
          <button className="tooltip-close" onClick={() => setOpen(false)}>✕</button>
          <p className="tooltip-title">How to get your Jira API Token</p>
          <ol className="tooltip-steps">
            <li>Go to <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">id.atlassian.com → Security → API Tokens</a></li>
            <li>Click <strong>Create API token</strong></li>
            <li>Give it a label e.g. <em>"CaseGen"</em></li>
            <li>Click <strong>Create</strong> and copy the token</li>
            <li>Paste it in the field above</li>
          </ol>
          <p className="tooltip-note">⚠️ Token is shown only once — save it securely.</p>
        </div>
      )}
    </div>
  );
}

export function InputPanel({ onGenerate, isLoading }: Props) {
  const [mode, setMode] = useState<InputMode>('prd');
  const [prdText, setPrdText] = useState('');
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState(() => localStorage.getItem('cg_jira_email') || '');
  const [jiraToken, setJiraToken] = useState(() => localStorage.getItem('cg_jira_token') || '');
  const [jiraDescription, setJiraDescription] = useState('');
  const [jiraFetching, setJiraFetching] = useState(false);
  const [jiraFetchError, setJiraFetchError] = useState('');
  const [jiraFetched, setJiraFetched] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('cg_mesh_key') || '');
  useState(() => { localStorage.removeItem('cg_model'); });
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [tcCount, setTcCount] = useState('10');
  const [tcTypes, setTcTypes] = useState<string[]>(['Functional', 'UI', 'Edge Case', 'Negative']);

  const activeInput = mode === 'prd' ? prdText : [jiraUrl, jiraDescription].join('\n');
  const estimate = useMemo(() => estimateTestCases(activeInput), [activeInput]);
  const parsedJira = useMemo(() => parseJiraUrl(jiraUrl), [jiraUrl]);

  const handleApiKeyChange = (v: string) => {
    setApiKey(v); localStorage.setItem('cg_mesh_key', v);
    setModels([]); setModelsError('');
  };
  const handleModelChange = (v: string) => setModel(v);

  const fetchModels = async () => {
    if (!apiKey.trim()) { alert('Enter your Mesh API key first.'); return; }
    setModelsLoading(true); setModelsError('');
    try {
      const res = await fetch('/mesh/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      const list: unknown[] = data.data ?? data.models ?? data.model_list ?? (Array.isArray(data) ? data : []);
      const ids: string[] = list.map((m: unknown) => typeof m === 'string' ? m : (m as { id?: string; name?: string })?.id ?? (m as { name?: string })?.name ?? '').filter(Boolean).sort();
      if (ids.length === 0) throw new Error(`Unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
      setModels(ids); handleModelChange(ids[0]);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
    } finally { setModelsLoading(false); }
  };

  const fetchJiraTicket = async () => {
    if (!parsedJira) { setJiraFetchError('Invalid Jira URL. Expected format: https://company.atlassian.net/browse/PROJ-123'); return; }
    if (!jiraEmail || !jiraToken) { setJiraFetchError('Enter Jira email and API token to auto-fetch.'); return; }
    setJiraFetching(true); setJiraFetchError(''); setJiraFetched(false);
    try {
      const { baseUrl, issueKey } = parsedJira;
      const apiUrl = `${baseUrl}/rest/api/3/issue/${issueKey}`;
      const auth = btoa(`${jiraEmail}:${jiraToken}`);
      const res = await fetch(
        `${edgeFunctionUrl('jira-fetch')}?issueUrl=${encodeURIComponent(apiUrl)}`,
        { headers: edgeFunctionHeaders({ 'x-jira-auth': auth }) }
      );
      if (!res.ok) throw new Error(`Jira responded with ${res.status}. Check your email, token, and URL.`);
      const data = await res.json();

      // Edge function returns structured data directly
      const combined = [
        `Ticket: ${data.issueKey ?? issueKey}`,
        data.summary && `Summary: ${data.summary}`,
        data.issueType && `Type: ${data.issueType}`,
        data.priority && `Priority: ${data.priority}`,
        data.status && `Status: ${data.status}`,
        data.assignee && `Assignee: ${data.assignee}`,
        data.description && `\nDescription:\n${data.description}`,
        data.acceptanceCriteria && `\nAcceptance Criteria:\n${data.acceptanceCriteria}`,
        data.labels?.length && `\nLabels: ${data.labels.join(', ')}`,
      ].filter(Boolean).join('\n');

      setJiraDescription(combined);
      setJiraFetched(true);
    } catch (e) {
      setJiraFetchError(e instanceof Error ? e.message : String(e));
    } finally { setJiraFetching(false); }
  };

  // Convert Atlassian Document Format to plain text
  function extractJiraDescription(adf: unknown): string {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;
    const doc = adf as { content?: unknown[] };
    if (!doc.content) return '';
    return doc.content.map(extractNode).join('\n');
  }

  function extractNode(node: unknown): string {
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === 'text') return n.text ?? '';
    if (n.content) return n.content.map(extractNode).join('');
    return '';
  }

  const handleSubmit = () => {
    const input = mode === 'prd' ? prdText : buildJiraInput();
    if (!input.trim()) return;

    if (!apiKey.trim()) { alert('Please enter your Mesh API key.'); return; }
    if (!model.trim()) { alert('Please load and select a model first.'); return; }
    const jira = (mode === 'jira' && parsedJira && jiraEmail && jiraToken)
      ? { jiraUrl, issueKey: parsedJira.issueKey, baseUrl: parsedJira.baseUrl, email: jiraEmail, token: jiraToken }
      : undefined;
    onGenerate(input, apiKey, model, jira, tcCount, tcTypes);
  };

  const buildJiraInput = () => {
    let out = '';
    if (jiraUrl) out += `Jira Ticket URL: ${jiraUrl}\n\n`;
    if (jiraDescription) out += jiraDescription;
    return out;
  };

  return (
    <div className="input-panel">
      <div className="panel-header">
        <h2>Input</h2>
        <div className="mode-tabs">
          <button className={mode === 'prd' ? 'tab active' : 'tab'} onClick={() => setMode('prd')}>PRD / Doc</button>
          <button className={mode === 'jira' ? 'tab active' : 'tab'} onClick={() => setMode('jira')}>Jira Ticket</button>
        </div>
      </div>

      <div className="field">
        <label>Mesh API Key</label>
        <input type="password" placeholder="Enter your Mesh API key…" value={apiKey} onChange={e => handleApiKeyChange(e.target.value)} />
        <span className="hint">Get your key at meshapi.ai — works with 300+ models</span>
      </div>

      <div className="field">
        <div className="model-label-row">
          <label>Model</label>
          <button className="load-models-btn" onClick={fetchModels} disabled={modelsLoading}>
            {modelsLoading ? 'Loading…' : models.length ? '↺ Refresh' : 'Load Models'}
          </button>
        </div>
        {models.length > 0 ? (
          <select value={model} onChange={e => handleModelChange(e.target.value)} className="model-select">
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input type="text" placeholder="Click 'Load Models' or type a model ID…" value={model} onChange={e => handleModelChange(e.target.value)} />
        )}
        {modelsError && <span className="hint hint-error">{modelsError}</span>}
      </div>

      {mode === 'prd' ? (
        <div className="field">
          <label>Paste PRD / Requirements Document</label>
          <textarea rows={13} placeholder="Paste your product requirements, feature spec, or any documentation here..." value={prdText} onChange={e => setPrdText(e.target.value)} />
        </div>
      ) : (
        <div className="jira-fields">
          <div className="field">
            <label>Jira Ticket URL</label>
            <div className="jira-url-row">
              <input type="url" placeholder="https://company.atlassian.net/browse/PROJ-123" value={jiraUrl} onChange={e => {
  setJiraUrl(e.target.value);
  setJiraFetched(false);
  setJiraDescription('');   // clear stale ticket content when URL changes
  setJiraFetchError('');
}} />
              {parsedJira && (
                <span className="jira-key-badge">{parsedJira.issueKey}</span>
              )}
            </div>
          </div>

          <div className="field">
            <label>Jira Email</label>
            <input type="text" autoComplete="off" placeholder="you@company.com" value={jiraEmail}
              onChange={e => { setJiraEmail(e.target.value); localStorage.setItem('cg_jira_email', e.target.value); }} />
          </div>

          <div className="field">
            <div className="label-with-info">
              <label>Jira API Token</label>
              <JiraTokenTooltip />
            </div>
            <input type="password" placeholder="Atlassian token" value={jiraToken}
              onChange={e => { setJiraToken(e.target.value); localStorage.setItem('cg_jira_token', e.target.value); }} />
          </div>

          <button className="fetch-jira-btn" onClick={fetchJiraTicket} disabled={jiraFetching || !parsedJira}>
            {jiraFetching ? <span className="btn-inner"><span className="spinner" /> Fetching ticket…</span>
              : jiraFetched ? <span className="btn-inner">✓ Ticket fetched — Refetch</span>
              : <span className="btn-inner">⬇ Fetch Ticket from Jira</span>}
          </button>
          {jiraFetchError && <span className="hint hint-error">{jiraFetchError}</span>}

          <div className="field">
            <label>
              Ticket Content
              {jiraFetched && <span className="fetched-badge">Auto-filled ✓</span>}
              {!jiraFetched && jiraUrl && !jiraDescription && (
                <span className="hint-inline"> — fetch or paste below</span>
              )}
            </label>
            <textarea rows={9}
              placeholder="Paste ticket description / acceptance criteria here, or use 'Fetch Ticket' above to auto-fill..."
              value={jiraDescription}
              onChange={e => setJiraDescription(e.target.value)} />
          </div>
        </div>
      )}

      {/* Test case count + type selector */}
      <div className="tc-config">
        <div className="field tc-count-field">
          <label>No. of Test Cases</label>
          <input
            type="number"
            min="1"
            max="50"
            value={tcCount}
            onChange={e => setTcCount(e.target.value)}
            className="tc-count-input"
          />
        </div>
        <div className="field">
          <label>Test Case Types</label>
          <div className="type-chips">
            {TEST_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={`type-chip ${tcTypes.includes(t) ? 'type-chip-active' : ''}`}
                onClick={() =>
                  setTcTypes(prev =>
                    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                  )
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {estimate.count > 0 && !isLoading && (
        <div className="estimate-box">
          <div className="estimate-left">
            <span className="estimate-icon">🧪</span>
            <span className="estimate-label">Estimated test cases</span>
          </div>
          <div className="estimate-right">
            <span className="estimate-count">~{estimate.count}</span>
            {estimate.breakdown.length > 0 && <span className="estimate-breakdown">({estimate.breakdown.join(', ')})</span>}
          </div>
        </div>
      )}

      <button className="generate-btn" onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? (
          <span className="btn-inner"><span className="spinner" /> Generating…</span>
        ) : estimate.count > 0 ? (
          <span className="btn-inner">Generate ~{estimate.count} Test Cases</span>
        ) : (
          <span className="btn-inner">Generate Test Cases</span>
        )}
      </button>
    </div>
  );
}
