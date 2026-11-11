import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst, transformWithOxc } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = new Set(JSON.parse(readFileSync(path.join(root, 'support/legacy-stage-tests.json'), 'utf8')));
const testDirs = new Set(['browser', 'renderer', 'runtime', 'history', 'harness']);
const stageName = /^stage-\d{2}-(?:implementation|review|recheck)(?:-[a-z0-9]+)*\.(?:test|spec)\.ts$/;
const kebabName = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:test|spec)\.ts$/;
const testFilename = /\.(?:test|spec)\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;
const sourceFilename = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;
const forbidden = new Set(['only', 'skip', 'fixme', 'todo']);
async function hiddenCalls(source, filename) {
  const { code } = await transformWithOxc(source, filename);
  const lines = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') {
      let expression = node.callee;
      const names = [];
      while (expression?.type === 'MemberExpression') {
        names.push(expression.computed ? expression.property.value : expression.property.name);
        expression = expression.object;
      }
      if (expression?.type === 'Identifier' && ['test', 'it', 'describe'].includes(expression.name) &&
          names.some(name => forbidden.has(name))) {
        lines.push(code.slice(0, node.start).split('\n').length);
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parseAst(code));
  return [...new Set(lines)];
}

function checkTestFile(relative) {
  const [dir, name] = relative.split('/');
  if (!testDirs.has(dir) || relative.split('/').length !== 2 ||
    (dir === 'browser' ? !name.endsWith('.spec.ts') : !name.endsWith('.test.ts'))) {
    return '테스트는 browser/*.spec.ts 또는 renderer/runtime/history/harness/*.test.ts에 둡니다';
  }
  if (!kebabName.test(name)) return '파일명은 소문자 kebab-case를 사용합니다';
  if (name.startsWith('stage-') && !stageName.test(name) && !legacy.has(relative)) {
    return '새 단계 테스트는 stage-NN-review/recheck/implementation 형식을 사용합니다';
  }
  return null;
}

if (process.argv.includes('--self-test')) {
  assert.equal(checkTestFile('browser/stage-10-review.spec.ts'), null);
  assert.equal(checkTestFile('runtime/stage-10-recheck.test.ts'), null);
  assert.match(checkTestFile('browser/stage-ten-review.spec.ts'), /stage-NN/);
  assert.match(checkTestFile('support/new.test.ts'), /테스트는/);
  assert.match(checkTestFile('browser/new.test.ts'), /테스트는/);
  assert.match(checkTestFile('runtime/BadName.test.ts'), /kebab-case/);
  assert.deepEqual(await hiddenCalls('it.only.each([1])("x", () => {});', 'probe.ts'), [1]);
  assert.deepEqual(await hiddenCalls('it.skip.each([1])("x", () => {});', 'probe.ts'), [1]);
  assert.deepEqual(await hiddenCalls('it\n .only("x", () => {});', 'probe.ts'), [1]);
  assert.deepEqual(await hiddenCalls('test["skip"]("x", () => {});', 'probe.ts'), [1]);
  assert.deepEqual(await hiddenCalls('it[ /* comment */ "only" /* comment */ ].each([1])("x", () => {});', 'probe.ts'), [1]);
  assert.deepEqual(await hiddenCalls('const value = `${it.only("x", () => {})}`;', 'probe.ts'), [1]);
  assert.equal((await hiddenCalls('export function registerCases() { it.only("x", () => {}); }', 'support/cases.ts')).length, 1);
  assert.deepEqual(await hiddenCalls('// it.skip("comment")\nconst text = "test.only()"; const template = `it.skip()`;', 'probe.ts'), []);
  assert.deepEqual(await hiddenCalls('it("normal", () => {});', 'probe.ts'), []);
  assert.match(checkTestFile('browser/stage-ten-review.spec.js'), /테스트는/);
  console.log('컨벤션 검사 자체 점검 통과');
  process.exit(0);
}

const issues = [];
const seenLegacy = new Set();
async function walk(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'reports', 'test-results', 'playwright-report'].includes(entry.name)) await walk(relative);
      continue;
    }
    if (!sourceFilename.test(entry.name)) continue;
    if (legacy.has(relative)) seenLegacy.add(relative);
    if (testFilename.test(entry.name)) {
      const issue = checkTestFile(relative);
      if (issue) issues.push(`${relative}: ${issue}`);
    }
    try {
      for (const line of await hiddenCalls(readFileSync(path.join(root, relative), 'utf8'), relative)) {
        issues.push(`${relative}:${line}: only/skip/fixme/todo로 실행을 숨기지 않습니다`);
      }
    } catch (error) {
      issues.push(`${relative}: 소스 구문 검사 실패: ${error.message}`);
    }
  }
}
await walk('.');
for (const file of legacy) if (!seenLegacy.has(file)) issues.push(`${file}: 없는 레거시 예외를 제거하세요`);
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else console.log('테스트 파일 배치·이름·실행 가시성 검사 통과');
