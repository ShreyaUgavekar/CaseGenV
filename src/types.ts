export type InputMode = 'prd' | 'jira';

export interface TestCase {
  id: string;           // TM_XX_001
  priority: 'P0' | 'P1' | 'P2';
  userRole: string;     // e.g. AdminPanel, Creator, Subscriber
  module: string;
  testType: string;     // UI, Functional, UI & Functional, etc.
  testScenario: string; // high-level scenario
  testCase: string;     // specific case description
  testData: string;
  precondition: string;
  testProcedure: string; // numbered steps as single string
  expectedResult: string;
  actualResult: string;
  status: 'Pass' | 'Fail' | 'NA' | '';
  bugId: string;
  testedBy: string;
  testedOn: string;
  reviewerComment: string;
}

export interface GenerationResult {
  testCases: TestCase[];
  summary: string;
  generatedAt: string;
}

export type GenerationStatus = 'idle' | 'loading' | 'success' | 'error';
