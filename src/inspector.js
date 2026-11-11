import { isIgnoredText } from './html-policy.js';

const names = { text: '텍스트', attrs: '속성', insert: '추가', remove: '삭제', move: '이동', replace: '교체', events: '이벤트', domProps: '입력값' };
const limit = 200;
const key = path => path.join('/');
const location = path => path.length ? `루트 → ${path.map(index => `자식 ${index}`).join(' → ')}` : '루트';
const shorten = value => { const text = String(value); return text.length > 120 ? `${text.slice(0, 120)}…` : text; };

// Follow VNode children rather than raw childNodes: formatting/comments are not UI nodes.
function capture(root, tree) {
  const nodes = new Map();
  function visit(dom, vnode, path) {
    if (!dom) return;
    nodes.set(key(path), dom);
    if (vnode.kind === 'text') return;
    let cursor = 0;
    const children = [...dom.childNodes];
    vnode.children.forEach((child, index) => {
      while (children[cursor] && (children[cursor].nodeType === 8 ||
        (children[cursor].nodeType === 3 && isIgnoredText(children[cursor].nodeValue) &&
          !(child.kind === 'text' && child.value === children[cursor].nodeValue)))) cursor++;
      visit(children[cursor++], child, [...path, index]);
    });
  }
  visit(root, tree, []);
  return nodes;
}

function treeText(tree) {
  const lines = []; let count = 0;
  function visit(node, depth) {
    if (++count > limit) return;
    const indent = '  '.repeat(Math.min(depth, 30));
    if (node.kind === 'text') { lines.push(`${indent}${JSON.stringify(shorten(node.value))}`); return; }
    const attrs = Object.entries(node.attrs).map(([name, value]) => ` ${name}=${JSON.stringify(shorten(value))}`).join('');
    const props = Object.entries(node.domProps ?? {}).map(([name, value]) => ` .${name}=${JSON.stringify(value)}`).join('');
    lines.push(`${indent}<${node.tag}${attrs}${props}>`);
    node.children.forEach(child => visit(child, depth + 1));
  }
  visit(tree, 0);
  if (count > limit) lines.push(`… 처음 ${limit}개 노드만 표시`);
  return lines.join('\n');
}

export function createInspector(panel) {
  const document = panel.ownerDocument, view = document.defaultView;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const heading = make('div', 'inspector-heading');
  const title = make('div'); title.append(make('p', 'eyebrow', 'DIFF · PATCH INSPECTOR'), make('h2', '', '무엇이 바뀌었을까요?'));
  const state = make('span', 'inspector-state', '첫 화면');
  heading.append(title, state);
  const metrics = make('div', 'inspector-metrics'), values = {};
  for (const [name, label] of [['visual', '화면 변경 계획'], ['events', '이벤트 변경 계획'], ['reused', '요소 재사용 / 현재 요소']]) {
    const card = make('div', 'inspector-metric'), value = make('strong', '', '—');
    value.dataset.metric = name; values[name] = value;
    card.append(make('span', '', label), value); metrics.append(card);
  }
  const toolbar = make('div', 'inspector-toolbar');
  const help = make('p', '', '작업을 선택하면 실제 화면에서 해당 위치를 강조해요.');
  const filter = make('label', 'inspector-filter'), checkbox = make('input');
  checkbox.type = 'checkbox'; filter.append(checkbox, document.createTextNode('이벤트도 보기'));
  toolbar.append(help, filter);
  const operations = make('ol', 'inspector-operations');
  const selection = make('p', 'inspector-selection', '아직 적용한 변경이 없어요.'); selection.setAttribute('role', 'status');
  const details = make('details', 'inspector-trees');
  details.append(make('summary', '', '변경 전·후 Virtual DOM 트리 보기'));
  const trees = make('div', 'inspector-tree-grid'), before = make('pre'), after = make('pre');
  before.dataset.tree = 'before'; after.dataset.tree = 'after';
  for (const [label, pre] of [['이전 트리', before], ['다음 트리', after]]) {
    const section = make('div'); section.append(make('h3', '', label), pre); trees.append(section);
  }
  details.append(trees);
  panel.classList.add('inspector');
  panel.replaceChildren(heading, metrics, toolbar, operations, selection, details,
    make('p', 'inspector-footnote', '계획 건수는 DOM API 호출 횟수나 속도 측정값이 아니에요. 재사용은 실제 요소 참조로 확인해요. 자식 번호는 0부터 시작해요.'));
  let previousNodes = new Map(), nextNodes = new Map(), latest = null, overlay = null, target = null, recovered = false;

  function unhighlight() { overlay?.remove(); overlay = null; target = null; }
  function reposition() {
    if (!target?.isConnected) { unhighlight(); return; }
    const rect = target.getBoundingClientRect();
    Object.assign(overlay.style, { left: `${rect.left - 4}px`, top: `${rect.top - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
  }
  function highlight(node) {
    unhighlight();
    if (!node?.isConnected) return;
    target = node.nodeType === 1 ? node : node.parentElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > view.innerHeight) target.scrollIntoView({ block: 'center', behavior: 'instant' });
    overlay = make('div', 'inspector-overlay'); overlay.dataset.inspectorOverlay = '';
    overlay.setAttribute('aria-hidden', 'true'); document.body.append(overlay); reposition();
  }
  function resolve(op) {
    if (op.type === 'remove') return null;
    const old = previousNodes.get(key(op.path));
    if (old?.isConnected && latest.root.contains(old) && op.type !== 'insert') return old;
    if (op.type === 'replace' && op.path.length === 0) return latest.root;
    if (op.type === 'insert' || op.type === 'replace') {
      const parentPath = op.type === 'insert' ? op.path : op.path.slice(0, -1);
      const parent = previousNodes.get(key(parentPath));
      const nextPath = [...nextNodes].find(([, node]) => node === parent)?.[0];
      if (nextPath !== undefined) return nextNodes.get(nextPath ? `${nextPath}/${op.index}` : String(op.index));
    }
    return null;
  }
  function describe(op) {
    if (op.type === 'text') return `→ ${JSON.stringify(shorten(op.value))}`;
    if (op.type === 'insert' || op.type === 'replace') return `${op.index === null ? '루트' : `목표 자식 ${op.index}`} · ${op.node.kind === 'text' ? JSON.stringify(shorten(op.node.value)) : `<${op.node.tag}>`}`;
    if (op.type === 'move') return `→ 같은 부모의 자식 ${op.index}로 이동`;
    if (op.type === 'remove') return '이전 요소 제거 · 다음 화면에는 없음';
    return [...Object.entries(op.set ?? {}).map(([name, value]) => `${name}: ${typeof value === 'function' ? '함수 교체' : JSON.stringify(shorten(value))}`), ...(op.remove ?? []).map(name => `${name}: 제거`)].join(' · ');
  }
  function renderOperations() {
    operations.replaceChildren(); unhighlight();
    if (recovered) {
      selection.textContent = '이전 화면으로 복구했어요. 위 수치와 트리는 최근 성공 기록이며, 다음 변경부터 새 DOM 위치를 보여줘요.';
      return;
    }
    const all = latest?.plan?.operations ?? [], visible = all.filter(op => checkbox.checked || op.type !== 'events');
    selection.textContent = visible.length ? '아래 작업을 선택해 실제 화면의 위치를 확인하세요.'
      : all.length ? '화면 변경 없음 · 이벤트 변경은 필터를 켜서 확인하세요.' : latest?.plan ? '변경 없음 · 새 DOM 작업 계획이 없어요.' : '첫 화면이에요. 수량이나 HTML을 바꿔 보세요.';
    visible.slice(0, limit).forEach((op, index) => {
      const item = make('li'), button = make('button', 'inspector-operation');
      button.type = 'button'; button.dataset.operation = String(index); button.setAttribute('aria-pressed', 'false');
      const badge = make('span', `operation-kind kind-${op.type}`, names[op.type]);
      const content = make('span', 'operation-content');
      content.append(make('strong', '', location(op.path)), make('span', '', describe(op)));
      button.append(badge, content);
      button.addEventListener('click', () => {
        operations.querySelectorAll('button').forEach(row => row.setAttribute('aria-pressed', String(row === button)));
        const node = resolve(op); highlight(node);
        selection.textContent = op.type === 'remove' ? '삭제된 요소는 이전 트리에서 확인할 수 있어요.'
          : node ? `${names[op.type]} · 파란 테두리가 실제 화면의 대응 위치예요.` : '현재 화면에 대응하는 요소가 없어요.';
      });
      item.append(button); operations.append(item);
    });
    if (visible.length > limit) selection.textContent += ` 처음 ${limit}건만 표시해요. 집계는 전체 기준이에요.`;
  }
  checkbox.addEventListener('change', renderOperations);
  view.addEventListener('resize', reposition);
  view.addEventListener('scroll', reposition, true);
  return {
    commit(event) {
      if (!event.root || !event.tree) return;
      recovered = false; checkbox.disabled = false;
      previousNodes = nextNodes; latest = event; nextNodes = capture(event.root, event.tree);
      const oldElements = new Set([...previousNodes.values()].filter(node => node.nodeType === 1));
      const elements = [...nextNodes.values()].filter(node => node.nodeType === 1);
      const reused = elements.filter(node => oldElements.has(node)).length;
      const ops = event.plan?.operations ?? [], events = ops.filter(op => op.type === 'events').length;
      values.visual.textContent = String(ops.length - events); values.events.textContent = String(events);
      values.reused.textContent = `${reused} / ${elements.length}`;
      state.textContent = !event.plan ? '첫 화면' : ops.length ? '적용 완료' : '변경 없음';
      before.textContent = event.plan ? treeText(event.plan.previous) : '아직 이전 트리가 없어요.';
      after.textContent = treeText(event.tree); renderOperations();
    },
    resync({ root, tree }) {
      if (!root || !tree) { this.clear('화면 복구에 실패했어요. 새로고침 후 다시 시작하세요.'); return; }
      unhighlight(); previousNodes.clear(); nextNodes = capture(root, tree);
      recovered = true; checkbox.disabled = true; state.textContent = '이전 화면 복구';
      renderOperations();
    },
    clear(message = '컴포넌트가 종료됐어요.') {
      unhighlight(); previousNodes.clear(); nextNodes.clear(); latest = null; operations.replaceChildren();
      recovered = false; checkbox.disabled = false;
      for (const value of Object.values(values)) value.textContent = '—';
      state.textContent = '대기'; selection.textContent = message; before.textContent = ''; after.textContent = '';
    },
    destroy() {
      unhighlight(); previousNodes.clear(); nextNodes.clear(); latest = null;
      view.removeEventListener('resize', reposition); view.removeEventListener('scroll', reposition, true);
      panel.replaceChildren();
    },
  };
}
