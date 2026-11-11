import { createInspector } from '../../src/inspector.js';
import { render, patch } from '../../src/dom.js';
import { diff } from '../../src/diff.js';
import { FunctionComponent, useState } from '../../src/component.js';
import { createPlayground } from '../../src/playground.js';
import { element as e, text as t } from '../fixtures.js';

export const tests = [];
const test = (name, run) => tests.push({ name: `VIS ${name}`, run });
const assert = (value, message = '기대 조건 불일치') => { if (!value) throw new Error(message); };
const list = keys => e('ul', keys.map(key => e('li', [t(key)], { 'data-key': key })));
function fixture(run) {
  const host = document.createElement('div'), panel = document.createElement('section');
  document.body.append(host, panel);
  let inspector;
  try { inspector = createInspector(panel); run(host, panel, inspector); }
  finally { inspector?.destroy(); host.remove(); panel.remove(); }
}
test('키 앞 삽입은 기존 요소 재사용 수와 이전·다음 트리 표시', () => fixture((host, panel, inspector) => {
  const before = list(['A', 'B', 'C']), after = list(['D', 'A', 'B', 'C']);
  const root = render(before); host.append(root);
  inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan);
  inspector.commit({ plan, root, tree: after });
  assert(panel.querySelector('[data-metric="reused"]').textContent === '4 / 5');
  assert(panel.querySelector('[data-tree="before"]').textContent.includes('A'));
  assert(panel.querySelector('[data-tree="after"]').textContent.includes('D'));
  assert(panel.textContent.includes('추가') && panel.textContent.includes('이동'));
  assert(panel.textContent.includes('위치 번호 변경이 포함되며, 실제 DOM 이동 횟수와 다릅니다'));
}));
test('강조 선택은 관리 DOM·속성·포커스를 변경하지 않음', () => fixture((host, panel, inspector) => {
  const before = e('div', [e('p', [t('사과')])]), after = e('div', [e('p', [t('배')])]);
  const root = render(before); host.append(root);
  inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan); inspector.commit({ plan, root, tree: after });
  const html = root.outerHTML, active = document.activeElement;
  panel.querySelector('[data-operation]').click();
  assert(root.outerHTML === html && document.activeElement === active);
  assert(document.querySelector('[data-inspector-overlay]'));
  inspector.clear('종료'); assert(!document.querySelector('[data-inspector-overlay]'));
}));
test('삭제 작업은 없는 요소를 강조하지 않으며 텍스트를 HTML로 실행하지 않음', () => fixture((host, panel, inspector) => {
  const before = e('div', [e('p', [t('<img src=x onerror=alert(1)>')])]), after = e('div', []);
  const root = render(before); host.append(root); inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan); inspector.commit({ plan, root, tree: after });
  panel.querySelector('[data-operation]').click();
  assert(!panel.querySelector('img')); assert(!document.querySelector('[data-inspector-overlay]'));
  assert(panel.textContent.includes('삭제'));
}));
test('초기화와 빈 Diff를 구분하고 destroy 뒤 오버레이 제거', () => fixture((host, panel, inspector) => {
  const tree = e('p', [t('같음')]), root = render(tree); host.append(root);
  inspector.commit({ plan: null, root, tree }); assert(panel.textContent.includes('첫 화면'));
  inspector.commit({ plan: diff(tree, tree), root, tree }); assert(panel.textContent.includes('변경 없음'));
  assert(panel.querySelectorAll('[data-operation]').length === 0);
}));
test('이벤트만 바뀐 커밋은 화면 작업 0건과 이벤트 집계·필터 표시', () => fixture((host, panel, inspector) => {
  const before = { ...e('button', [t('클릭')]), events: { click() {} } };
  const after = { ...before, events: { click() {} } };
  const root = render(before, document, { phase: 2 }); host.append(root);
  inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan, { phase: 2 }); inspector.commit({ plan, root, tree: after });
  assert(panel.querySelector('[data-metric="visual"]').textContent === '0');
  assert(panel.querySelector('[data-metric="events"]').textContent === '1');
  assert(panel.querySelectorAll('[data-operation]').length === 0);
  panel.querySelector('input[type="checkbox"]').click();
  assert(panel.querySelectorAll('[data-operation]').length === 1);
}));
for (const kind of ['attrs', 'replace', 'insert']) test(`${kind} 작업의 강조는 새 화면의 정확한 대상`, () => fixture((host, panel, inspector) => {
  const before = e('div', [e('p', [t('이전')])]);
  const after = kind === 'replace' ? e('strong', [t('새 루트')])
    : kind === 'attrs' ? e('div', [e('p', [t('이전')], { title: '변경' })])
      : e('div', [e('p', [t('이전')]), e('span', [t('추가')])]);
  let root = render(before); host.append(root); inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); root = patch(root, plan); inspector.commit({ plan, root, tree: after });
  panel.querySelector('[data-operation]').click();
  const target = kind === 'replace' ? root : kind === 'insert' ? root.lastChild : root.firstChild;
  const box = target.getBoundingClientRect(), overlay = document.querySelector('[data-inspector-overlay]');
  assert(overlay && parseFloat(overlay.style.width) === box.width + 8);
  assert(root.getAttribute('style') === null);
}));
test('긴 목록은 표시 한도를 알리고 전체 요소 수를 집계', () => fixture((host, panel, inspector) => {
  const before = list([]), after = list(Array.from({ length: 250 }, (_, i) => String(i)));
  const root = render(before); host.append(root); inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan); inspector.commit({ plan, root, tree: after });
  assert(panel.querySelectorAll('[data-operation]').length === 200);
  assert(panel.querySelector('[data-metric="visual"]').textContent === '250');
  assert(panel.querySelector('[data-metric="reused"]').textContent === '1 / 251');
  assert(panel.textContent.includes('처음 200'));
}));
test('화면 밖의 작업을 선택하면 대응 요소가 보이는 위치로 이동', () => fixture((host, panel, inspector) => {
  host.style.marginTop = '200vh';
  const before = e('p', [t('사과')]), after = e('p', [t('배')]);
  const root = render(before); host.append(root); inspector.commit({ plan: null, root, tree: before });
  const plan = diff(before, after); patch(root, plan); inspector.commit({ plan, root, tree: after });
  panel.querySelector('[data-operation]').click();
  const rect = root.getBoundingClientRect();
  assert(rect.top >= 0 && rect.bottom <= window.innerHeight, '강조 대상이 화면 안에 보여야 함');
}));
test('FunctionComponent는 mount와 성공한 State 커밋만 알림', () => {
  const host = document.createElement('div'); document.body.append(host);
  const records = []; let set; let broken = false;
  const instance = new FunctionComponent(() => { const [n, setter] = useState(0); set = setter; if (broken) throw new Error('렌더 실패'); return e('p', [t(String(n))]); }, host, {}, { onCommit: event => records.push(event) });
  try {
    instance.mount(); set(1);
    assert(records.length === 2 && records[0].plan === null && records[1].plan.operations[0].type === 'text');
    broken = true; try { set(2); } catch {}
    assert(records.length === 2 && host.textContent === '1');
  } finally { instance.unmount(); host.remove(); }
});
test('Component Patch 실패 복구 후 강조 해제와 다음 커밋 재사용 기준 회복', () => fixture((host, panel, inspector) => {
  let set;
  const instance = new FunctionComponent(() => { const [n, setter] = useState(0); set = setter; return e('p', [t(String(n))]); }, host, {}, {
    onCommit: event => inspector.commit(event), onRecovery: event => inspector.resync(event),
  });
  try {
    instance.mount(); set(1); panel.querySelector('[data-operation]').click();
    host.firstChild.textContent = '변조';
    try { set(2); } catch {}
    assert(host.textContent === '1');
    assert(!document.querySelector('[data-inspector-overlay]'), '복구 시 오래된 강조 제거');
    set(2); assert(panel.querySelector('[data-metric="reused"]').textContent === '1 / 1');
    panel.querySelector('[data-operation]').click(); assert(document.querySelector('[data-inspector-overlay]'));
  } finally { instance.unmount(); }
}));
test('Phase 1 복구 후 다음 Patch는 재생성된 DOM을 기준으로 관찰', () => fixture((host, panel, inspector) => {
  host.innerHTML = '<div id="actual"><p>A</p></div><div id="preview"></div><textarea></textarea><button id="patch"></button><button id="back"></button><button id="forward"></button><p id="error"></p><p id="status"></p>';
  const find = name => host.querySelector(`#${name}`), editor = host.querySelector('textarea');
  const apply = value => { editor.value = `<p>${value}</p>`; editor.dispatchEvent(new Event('input')); find('patch').click(); };
  createPlayground({ actual: find('actual'), preview: find('preview'), editor, patchButton: find('patch'), backButton: find('back'), forwardButton: find('forward'), error: find('error'), status: find('status'), onCommit: event => inspector.commit(event), onRecovery: event => inspector.resync(event) });
  apply('B'); panel.querySelector('[data-operation]').click();
  find('actual').firstChild.textContent = '변조'; apply('C');
  assert(find('actual').textContent === 'B' && find('error').textContent);
  assert(!document.querySelector('[data-inspector-overlay]'), '복구 시 오래된 강조 제거');
  apply('C'); assert(panel.querySelector('[data-metric="reused"]').textContent === '1 / 1');
  panel.querySelector('[data-operation]').click(); assert(document.querySelector('[data-inspector-overlay]'));
}));
test('관찰 콜백 오류는 이미 성공한 Component 커밋을 취소하지 않음', () => {
  const host = document.createElement('div'); document.body.append(host); let set, calls = 0;
  const instance = new FunctionComponent(() => { const [n, setter] = useState(0); set = setter; return e('p', [t(String(n))]); }, host, {}, { onCommit() { calls++; throw new Error('관찰 실패'); } });
  try { instance.mount(); set(1); assert(calls === 2 && host.textContent === '1' && instance.hooks[0].value === 1); }
  finally { instance.unmount(); host.remove(); }
});
test('Component 복구까지 실패하면 시각화 강조·이전 작업을 비움', () => fixture((host, panel, inspector) => {
  let set;
  const instance = new FunctionComponent(() => { const [n, setter] = useState(0); set = setter; return e('p', [t(String(n))]); }, host, {}, { onCommit: event => inspector.commit(event), onRecovery: event => inspector.resync(event) });
  try {
    instance.mount(); set(1); panel.querySelector('[data-operation]').click(); host.firstChild.textContent = '변조';
    host.replaceChildren = () => { throw new Error('복구 실패'); };
    try { set(2); } catch {}
    assert(instance.blocked && !document.querySelector('[data-inspector-overlay]'));
    assert(!panel.querySelector('[data-operation]') && panel.textContent.includes('새로고침'));
  } finally { instance.unmount(); }
}));
test('Phase 1 복구까지 실패하면 시각화도 중단 상태를 표시', () => fixture((host, panel, inspector) => {
  host.innerHTML = '<div id="actual"><p>A</p></div><div id="preview"></div><textarea></textarea><button id="patch"></button><button id="back"></button><button id="forward"></button><p id="error"></p><p id="status"></p>';
  const find = name => host.querySelector(`#${name}`), editor = host.querySelector('textarea');
  const apply = value => { editor.value = `<p>${value}</p>`; editor.dispatchEvent(new Event('input')); find('patch').click(); };
  createPlayground({ actual: find('actual'), preview: find('preview'), editor, patchButton: find('patch'), backButton: find('back'), forwardButton: find('forward'), error: find('error'), status: find('status'), onCommit: event => inspector.commit(event), onRecovery: event => inspector.resync(event) });
  apply('B'); panel.querySelector('[data-operation]').click(); find('actual').firstChild.textContent = '변조';
  find('actual').replaceChildren = () => { throw new Error('복구 실패'); }; apply('C');
  assert(find('patch').disabled && !document.querySelector('[data-inspector-overlay]'));
  assert(!panel.querySelector('[data-operation]') && panel.textContent.includes('새로고침'));
}));
test('Phase 1 알림은 초기화·Patch·History 성공에만 발생', () => {
  const host = document.createElement('div');
  host.innerHTML = '<div id="actual"><p>사과</p></div><div id="preview"></div><textarea></textarea><button id="patch"></button><button id="back"></button><button id="forward"></button><p id="error"></p><p id="status"></p>';
  document.body.append(host); const find = name => host.querySelector(`#${name}`), records = [];
  const editor = host.querySelector('textarea');
  try {
    createPlayground({ actual: find('actual'), preview: find('preview'), editor, patchButton: find('patch'), backButton: find('back'), forwardButton: find('forward'), error: find('error'), status: find('status'), onCommit: record => records.push(record) });
    assert(records.length === 1 && records[0].plan === null);
    editor.value = '<p>배</p>'; editor.dispatchEvent(new Event('input')); assert(records.length === 1);
    find('patch').click(); assert(records.length === 2 && records[1].root.textContent === '배');
    find('back').click(); assert(records.length === 3 && records[2].root.textContent === '사과');
    editor.value = '<script></script>'; editor.dispatchEvent(new Event('input')); find('patch').click(); assert(records.length === 3);
  } finally { host.remove(); }
});
