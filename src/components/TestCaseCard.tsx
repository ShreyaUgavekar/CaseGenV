import { useState } from 'react';
import type { TestCase } from '../types';

interface Props {
  testCase: TestCase;
  index: number;
}

const PRIORITY_CLASS: Record<string, string> = {
  P0: 'badge-p0',
  P1: 'badge-p1',
  P2: 'badge-p2',
};

const TYPE_CLASS: Record<string, string> = {
  'UI': 'badge-ui',
  'Functional': 'badge-functional',
  'UI & Functional': 'badge-uifunc',
  'Performance': 'badge-perf',
  'Security': 'badge-security',
};

export function TestCaseCard({ testCase, index }: Props) {
  const [expanded, setExpanded] = useState(index < 2);

  const steps = testCase.testProcedure
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="tc-card">
      <div className="tc-header" onClick={() => setExpanded(e => !e)}>
        <div className="tc-title-row">
          <span className="tc-id">{testCase.id}</span>
          <span className="tc-title">{testCase.testCase}</span>
        </div>
        <div className="tc-badges">
          <span className={`badge ${PRIORITY_CLASS[testCase.priority] ?? 'badge-p2'}`}>
            {testCase.priority}
          </span>
          <span className={`badge ${TYPE_CLASS[testCase.testType] ?? 'badge-functional'}`}>
            {testCase.testType}
          </span>
          <span className="tc-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="tc-body">
          <div className="tc-meta-row">
            <span className="tc-meta-item"><strong>Role:</strong> {testCase.userRole}</span>
            <span className="tc-meta-item"><strong>Module:</strong> {testCase.module}</span>
          </div>

          <div className="tc-section">
            <strong>Scenario</strong>
            <p className="tc-description">{testCase.testScenario}</p>
          </div>

          {testCase.testData && (
            <div className="tc-section">
              <strong>Test Data</strong>
              <p className="tc-description">{testCase.testData}</p>
            </div>
          )}

          {testCase.precondition && (
            <div className="tc-section">
              <strong>Precondition</strong>
              <p className="tc-description">{testCase.precondition}</p>
            </div>
          )}

          <div className="tc-section">
            <strong>Test Procedure</strong>
            <ol>
              {steps.map((step, i) => (
                <li key={i}>{step.replace(/^\d+\.\s*/, '')}</li>
              ))}
            </ol>
          </div>

          <div className="tc-section tc-expected">
            <strong>Expected Result</strong>
            <p>{testCase.expectedResult}</p>
          </div>
        </div>
      )}
    </div>
  );
}
