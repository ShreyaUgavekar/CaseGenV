import { useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { generateTestCases } from './api/generateTestCases';
import type { GenerationResult, GenerationStatus } from './types';
import './App.css';

export interface JiraContext {
  jiraUrl: string;
  issueKey: string;
  baseUrl: string;
  email: string;
  token: string;
}

export default function App() {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [jiraContext, setJiraContext] = useState<JiraContext | null>(null);

  const handleGenerate = async (
    input: string,
    apiKey: string,
    model: string,
    jira?: JiraContext,
    tcCount?: string,
    tcTypes?: string[]
  ) => {
    setStatus('loading');
    setResult(null);
    setError(null);
    setStreamingText('');
    setJiraContext(jira ?? null);

    try {
      const res = await generateTestCases(input, apiKey, model, chunk => {
        setStreamingText(chunk);
      }, tcCount, tcTypes);
      setResult(res);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-name">CaseGen</span>
        </div>
        <p className="logo-tagline">AI-powered test case generation from PRDs &amp; Jira tickets</p>
      </header>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      <main className="app-body">
        <InputPanel onGenerate={handleGenerate} isLoading={status === 'loading'} />
        <ResultsPanel
          result={result}
          streamingText={streamingText}
          isLoading={status === 'loading'}
          jiraContext={jiraContext}
        />
      </main>
    </div>
  );
}
