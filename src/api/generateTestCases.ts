import type { TestCase, GenerationResult } from '../types';
import { edgeFunctionUrl, edgeFunctionHeaders } from './supabase';

const SYSTEM_PROMPT = `You are a senior QA engineer. Your job is to read the provided PRD or Jira ticket and generate SPECIFIC, DETAILED test cases directly based on the exact features, flows, roles, data, and business rules described in the input.

CRITICAL RULES:
- Every test case MUST reference actual feature names, field names, button labels, user roles, URLs, and values from the input — NOT generic placeholders.
- testData must contain REAL values: actual URLs, account types, input values, API payloads mentioned in the input.
- testProcedure must have PRECISE numbered steps matching the actual UI flow described — not "click button", but "click the 'Update GST' button on the Freedom Creators list".
- expectedResult must state the EXACT outcome: actual UI text, API response, data change, or error message.
- Cover: happy path, role-based access (who CAN vs who CANNOT), boundary/edge values, invalid inputs, UI visibility, data persistence, cross-feature impact.
- DO NOT generate generic test cases like "verify login works" unless login is explicitly part of the requirements.

Return ONLY valid JSON — no markdown, no code fences, no explanation:
{
  "summary": "One sentence: what feature/module was analyzed",
  "testCases": [
    {
      "id": "TM_XX_001",
      "priority": "P0",
      "userRole": "exact role from the input e.g. AdminPanel / Creator / Subscriber",
      "module": "exact module name from input",
      "testType": "UI | Functional | UI & Functional | Performance | Security",
      "testScenario": "The specific feature scenario being validated",
      "testCase": "Precise description of what this test verifies — mention actual feature/field names",
      "testData": "Actual test data: URLs, account emails, input values, credentials, API fields from the input",
      "precondition": "Specific state required: logged in as X, feature Y enabled, record Z exists",
      "testProcedure": "1.Navigate to <exact URL>\n2.Login as <specific role/account>\n3.Click <exact button/link name>\n4.Enter <exact value> in <exact field>\n5.Observe result",
      "expectedResult": "Exact expected outcome: specific UI text, data value, API response, or error message",
      "actualResult": "",
      "status": "",
      "bugId": "",
      "testedBy": "",
      "testedOn": "",
      "reviewerComment": ""
    }
  ]
}

Generate exactly 10 test cases. Keep each testProcedure under 8 steps. Vary priority (P0 for critical flows, P1 for important, P2 for edge cases).`;

function sanitizeJSONString(raw: string): string {
  // Replace unescaped control characters inside JSON string values
  // Walk char by char, escaping bare newlines/tabs/carriage returns inside strings
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      // strip other control characters (ASCII 0–31)
      if (ch.charCodeAt(0) < 32) continue;
    }
    result += ch;
  }
  return result;
}

function repairJSON(raw: string): string {
  // strip markdown fences
  let s = raw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  s = sanitizeJSONString(s);

  // extract the outermost { ... } block
  const start = s.indexOf('{');
  if (start === -1) throw new Error(`No JSON object found. Raw:\n${raw.slice(0, 300)}`);
  s = s.slice(start);

  // try as-is first
  try { JSON.parse(s); return s; } catch { /* fall through to repair */ }

  // remove trailing incomplete property/value and close open structures
  // strip everything after the last complete test case object (last closing } before truncation)
  const lastComplete = s.lastIndexOf('},');
  if (lastComplete !== -1) s = s.slice(0, lastComplete + 1);

  // count open brackets and close them
  let openBraces = 0, openBrackets = 0;
  let inString = false, escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }
  // close open structures
  s = s.trimEnd().replace(/,\s*$/, ''); // remove trailing comma
  for (let i = 0; i < openBrackets; i++) s += ']';
  for (let i = 0; i < openBraces; i++) s += '}';

  return s;
}

// Ensure every field is a plain string — the model sometimes returns nested objects
function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(stringify).join('\n');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, val]) => `${k}: ${stringify(val)}`).join('\n');
  return String(v);
}

function sanitizeTestCase(tc: Record<string, unknown>): TestCase {
  return {
    id:               stringify(tc.id) || 'TM_XX_000',
    priority:         (stringify(tc.priority) as TestCase['priority']) || 'P1',
    userRole:         stringify(tc.userRole),
    module:           stringify(tc.module),
    testType:         stringify(tc.testType),
    testScenario:     stringify(tc.testScenario),
    testCase:         stringify(tc.testCase),
    testData:         stringify(tc.testData),
    precondition:     stringify(tc.precondition),
    testProcedure:    stringify(tc.testProcedure),
    expectedResult:   stringify(tc.expectedResult),
    actualResult:     '',
    status:           '',
    bugId:            '',
    testedBy:         '',
    testedOn:         '',
    reviewerComment:  '',
  };
}

function extractJSON(raw: string): { summary: string; testCases: TestCase[] } {
  const repaired = repairJSON(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(repaired);
  } catch (e) {
    throw new Error(`JSON parse failed: ${(e as Error).message}\nRaw (last 300):\n${raw.slice(-300)}`);
  }
  const testCases = (parsed.testCases as Record<string, unknown>[] ?? []).map(sanitizeTestCase);
  return { summary: stringify(parsed.summary), testCases };
}

export async function generateTestCases(
  input: string,
  apiKey: string,
  model: string,
  onChunk?: (chunk: string) => void,
  tcCount = '10',
  tcTypes: string[] = ['Functional', 'UI', 'Edge Case', 'Negative']
): Promise<GenerationResult> {

  const response = await fetch(edgeFunctionUrl('generate'), {
    method: 'POST',
    headers: edgeFunctionHeaders({
      'Content-Type': 'application/json',
      'x-mesh-key': apiKey,
    }),
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Generate exactly ${tcCount} test cases covering ONLY these types: ${tcTypes.join(', ')}.\n\nRequirements:\n\n${input}` },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Mesh API error ${response.status}: ${JSON.stringify(err?.error ?? err)}`);
  }

  // Read streaming SSE
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data:')) continue;

      const jsonStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          onChunk?.(fullText);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('Empty response from Mesh API. Try a different model.');
  }

  const result = extractJSON(fullText);
  return {
    testCases: result.testCases,
    summary: result.summary,
    generatedAt: new Date().toISOString(),
  };
}
