import { useState } from 'react';
import type { GenerationResult, TestCase } from '../types';
import type { JiraContext } from '../App';
import { TestCaseCard } from './TestCaseCard';
import { edgeFunctionUrl, edgeFunctionHeaders } from '../api/supabase';

async function openInGoogleSheets(testCases: TestCase[]) {
  const rows = [CSV_HEADERS, ...testCases.map(toCSVRow)];
  const tsv = rows
    .map(r => r.map(v => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' | ')).join('\t'))
    .join('\n');

  // Copy TSV to clipboard (Google Sheets pastes TSV natively as columns)
  await navigator.clipboard.writeText(tsv);

  // Open a new blank Google Sheet
  window.open('https://docs.google.com/spreadsheets/d/create', '_blank');
}

interface Props {
  result: GenerationResult | null;
  streamingText: string;
  isLoading: boolean;
  jiraContext: JiraContext | null;
}

const CSV_HEADERS = [
  'Test Case ID', 'Priority', 'User Role', 'Module', 'Test Type',
  'Test Scenario', 'Test Cases', 'Test Data', 'Precondition',
  'Test procedure', 'Expected Result', 'Actual Result', 'Status',
  'Bug id', 'Tested by', 'Tested on', 'Reviewer Comment',
];

function toCSVRow(tc: TestCase): string[] {
  return [
    tc.id, tc.priority, tc.userRole, tc.module, tc.testType,
    tc.testScenario, tc.testCase, tc.testData, tc.precondition,
    tc.testProcedure, tc.expectedResult, tc.actualResult, tc.status,
    tc.bugId, tc.testedBy, tc.testedOn, tc.reviewerComment,
  ];
}

function escapeCSV(val: string): string {
  return `"${val.replace(/"/g, '""')}"`;
}

function buildCSVBlob(testCases: TestCase[]): Blob {
  const rows = [CSV_HEADERS, ...testCases.map(toCSVRow)];
  const csv = rows
    .map(r => r.map(v => escapeCSV(String(v ?? '').replace(/\r?\n/g, ' | '))).join(','))
    .join('\r\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
}

function exportCSV(testCases: TestCase[]) {
  const blob = buildCSVBlob(testCases);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'test-cases.csv';
  a.click();
}

function exportJSON(result: GenerationResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'test-cases.json';
  a.click();
}

async function uploadToJira(testCases: TestCase[], jira: JiraContext): Promise<string> {
  const { baseUrl, issueKey, email, token } = jira;
  const auth = btoa(`${email}:${token}`);
  const filename = `test-cases-${issueKey}-${new Date().toISOString().slice(0, 10)}.csv`;

  // Build CSV as plain text for JSON transport to edge function
  const rows = [CSV_HEADERS, ...testCases.map(toCSVRow)];
  const csvContent = rows
    .map(r => r.map(v => escapeCSV(String(v ?? '').replace(/\r?\n/g, ' | '))).join(','))
    .join('\r\n');

  const res = await fetch(edgeFunctionUrl('jira-upload'), {
    method: 'POST',
    headers: edgeFunctionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ baseUrl, issueKey, auth, filename, csvContent }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Upload failed (${res.status}): ${err?.error ?? JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.ticketUrl ?? `${baseUrl}/browse/${issueKey}`;
}

export function ResultsPanel({ result, streamingText, isLoading, jiraContext }: Props) {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [sheetsToast, setSheetsToast] = useState(false);

  if (!result && !isLoading) {
    return (
      <div className="results-panel results-empty">
        <div className="empty-state">
          <div className="empty-icon">🧪</div>
          <h3>Test cases will appear here</h3>
          <p>Paste your PRD or Jira ticket on the left and click Generate.</p>
        </div>
      </div>
    );
  }

  if (isLoading && !result) {
    return (
      <div className="results-panel results-streaming">
        <div className="streaming-header">
          <span className="pulse-dot" />
          <span>Generating test cases…</span>
        </div>
        <pre className="streaming-text">{streamingText || 'Connecting…'}</pre>
      </div>
    );
  }

  if (!result) return null;

  const p0 = result.testCases.filter(t => t.priority === 'P0').length;
  const p1 = result.testCases.filter(t => t.priority === 'P1').length;
  const p2 = result.testCases.filter(t => t.priority === 'P2').length;
  const types: Record<string, number> = {};
  for (const tc of result.testCases) {
    types[tc.testType] = (types[tc.testType] || 0) + 1;
  }

  const handleUpload = async () => {
    if (!jiraContext) return;
    setUploadStatus('uploading');
    setUploadMsg('');
    try {
      const ticketUrl = await uploadToJira(result.testCases, jiraContext);
      setUploadStatus('done');
      setUploadMsg(ticketUrl);
    } catch (e) {
      setUploadStatus('error');
      setUploadMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="results-panel">
      <div className="results-header">
        <div>
          <h2>Test Cases <span className="tc-count">{result.testCases.length}</span></h2>
          <p className="results-summary">{result.summary}</p>
        </div>
        <div className="export-btns">
          <button className="export-btn" onClick={() => exportCSV(result.testCases)}>↓ CSV</button>
          <button className="export-btn" onClick={() => exportJSON(result)}>↓ JSON</button>
          <button
            className="export-btn sheets-btn"
            onClick={async () => {
              await openInGoogleSheets(result.testCases);
              setSheetsToast(true);
              setTimeout(() => setSheetsToast(false), 6000);
            }}
            title="Copy data and open Google Sheets"
          >
            <img src="https://ssl.gstatic.com/docs/spreadsheets/favicon3.ico" width={13} height={13} style={{verticalAlign:'middle', marginRight: 4}} alt="" />
            Sheets
          </button>
          {jiraContext && (
            <button
              className={`export-btn jira-upload-btn ${uploadStatus === 'done' ? 'jira-upload-done' : ''}`}
              onClick={handleUpload}
              disabled={uploadStatus === 'uploading'}
              title={`Upload CSV to ${jiraContext.issueKey}`}
            >
              {uploadStatus === 'uploading' ? (
                <span className="btn-inner"><span className="spinner spinner-sm" /> Uploading…</span>
              ) : uploadStatus === 'done' ? (
                '✓ Uploaded to Jira'
              ) : (
                `↑ Upload to ${jiraContext.issueKey}`
              )}
            </button>
          )}
        </div>
      </div>

      {sheetsToast && (
        <div className="sheets-toast">
          <span>📋 Data copied! In the new Google Sheet press</span>
          <kbd>Cmd+V</kbd> <span>or</span> <kbd>Ctrl+V</kbd> <span>to paste all test cases.</span>
        </div>
      )}

      {uploadStatus === 'done' && uploadMsg && (
        <div className="jira-upload-success">
          ✅ CSV attached & comment added on <a href={uploadMsg} target="_blank" rel="noreferrer">{jiraContext?.issueKey}</a>
        </div>
      )}
      {uploadStatus === 'error' && uploadMsg && (
        <div className="jira-upload-error">⚠️ {uploadMsg}</div>
      )}

      <div className="stats-row">
        <div className="stat stat-p0"><span className="stat-num">{p0}</span><span className="stat-label">P0</span></div>
        <div className="stat stat-p1"><span className="stat-num">{p1}</span><span className="stat-label">P1</span></div>
        <div className="stat stat-p2"><span className="stat-num">{p2}</span><span className="stat-label">P2</span></div>
        {Object.entries(types).map(([type, count]) => (
          <div className="stat stat-type" key={type}>
            <span className="stat-num">{count}</span>
            <span className="stat-label">{type}</span>
          </div>
        ))}
      </div>

      <div className="tc-list">
        {result.testCases.map((tc, i) => (
          <TestCaseCard key={tc.id} testCase={tc} index={i} />
        ))}
      </div>

      <p className="generated-at">Generated {new Date(result.generatedAt).toLocaleString()}</p>
    </div>
  );
}
