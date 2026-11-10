import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unit = JSON.parse(await readFile(path.join(workspace, 'reports/unit.json'), 'utf8'));
const browser = JSON.parse(await readFile(path.join(workspace, 'reports/browser.json'), 'utf8'));
const cases = [];
const ids = (title, prefix) => [...new Set(title.match(new RegExp(`${prefix}-\\d{2}`, 'g')) ?? [])];

for (const suite of unit.testResults) {
  for (const test of suite.assertionResults) {
    const missing = test.failureMessages.some((message) => message.includes('[IMPLEMENTATION_MISSING]'));
    const file = path.relative(workspace, suite.name);
    cases.push({
      layer: file.startsWith('harness/') ? 'harness' : 'unit',
      file,
      title: test.fullName,
      requirements: [...new Set(test.fullName.match(/\b(?:VDOM|DIFF|PATCH|COMP|STA|EFF|MEMO|EDIT|VIEW|HIST|TECH|QA)-\d{2}\b/g) ?? [])],
      policies: ids(test.fullName, 'OPEN'),
      runnerStatus: test.status,
      outcome: missing ? 'implementation-missing' : test.status,
    });
  }
}

function collect(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const errors = test.results.flatMap((result) => result.errors ?? (result.error ? [result.error] : []));
        const unavailable = errors.length > 0 && errors.every((error) => error.message?.includes('ERR_CONNECTION_REFUSED'));
        cases.push({
          layer: 'browser', file: `browser/${spec.file}`, line: spec.line,
          title: spec.title,
          requirements: [...new Set(spec.title.match(/\b(?:VDOM|DIFF|PATCH|COMP|STA|EFF|MEMO|EDIT|VIEW|HIST|TECH|QA)-\d{2}\b/g) ?? [])],
          policies: ids(spec.title, 'OPEN'),
          runnerStatus: test.status,
          outcome: unavailable ? 'app-unavailable' : test.status,
        });
      }
    }
    collect(suite.suites ?? []);
  }
}
collect(browser.suites);
cases.sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title));
const seen = new Set();
for (const test of cases) {
  const key = `${test.file}:${test.title}`;
  if (seen.has(key)) throw new Error(`Duplicate test case: ${key}`);
  seen.add(key);
}
const expected = unit.numTotalTests + browser.stats.expected + browser.stats.unexpected + browser.stats.skipped + browser.stats.flaky;
if (cases.length !== expected) throw new Error(`Report count mismatch: ${cases.length} / ${expected}`);
const summary = {
  collected: cases.length,
  productCases: cases.filter((test) => test.layer !== 'harness').length,
  harnessPassed: cases.filter((test) => test.layer === 'harness' && test.outcome === 'passed').length,
  implementationMissing: cases.filter((test) => test.outcome === 'implementation-missing').length,
  appUnavailable: cases.filter((test) => test.outcome === 'app-unavailable').length,
};
await writeFile(path.join(workspace, 'test-cases.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: '실제 runner JSON에서 생성. 구현 누락/앱 부재는 인수조건 통과가 아니다. 정책 표시는 파일 README의 공통 임시 전제도 함께 적용한다.',
  summary,
  cases: cases.map((test, index) => ({ id: `TC-${String(index + 1).padStart(3, '0')}`, ...test })),
}, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log('Per-file case counts:', JSON.stringify(Object.fromEntries([...new Set(cases.map((test) => test.file))].map((file) => [file, cases.filter((test) => test.file === file).length])), null, 2));
