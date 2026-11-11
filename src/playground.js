import { parseHTML, serializeHTML } from './html-input.js';
import { readDom, render, patch } from './dom.js';
import { diff } from './diff.js';
import { createHistory, commitHistory, moveHistory } from './history.js';
import { sameTree } from './vnode.js';
import { isWhitespace } from './html-policy.js';

export function createPlayground(ui) {
  const { actual, preview, editor, patchButton, backButton, forwardButton, error, status, onCommit, onRecovery } = ui;
  function notify(plan, tree, recovered = false) {
    try { (recovered ? onRecovery : onCommit)?.({ plan, tree, root: actual.firstElementChild }); }
    catch (caught) { console.warn('시각화 알림 실패', caught); }
  }
  let history, valid = false, blocked = false;
  const snapshot = () => history.entries[history.index];
  function buttons() {
    patchButton.disabled = blocked || !valid;
    backButton.disabled = blocked || !history || history.index === 0;
    forwardButton.disabled = blocked || !history || history.index === history.entries.length - 1;
    if (history) status.textContent = `이력 ${history.index + 1} / ${history.entries.length}`;
  }
  function report(caught) { error.textContent = caught.message; buttons(); }
  function singleRoot(container) {
    const roots = [...container.childNodes].filter(node => node.nodeType !== 8 && !(node.nodeType === 3 && isWhitespace(node.nodeValue)));
    if (roots.length !== 1 || roots[0].nodeType !== 1) throw new Error('영역에는 바깥 요소 하나가 필요합니다.');
    return roots[0];
  }
  try {
    const root = singleRoot(actual), tree = readDom(root), source = serializeHTML(tree);
    const parsed = parseHTML(source);
    if (!sameTree(parsed, tree)) throw new Error('초기 HTML과 DOM의 구조가 다릅니다.');
    const initialPreview = render(tree, actual.ownerDocument);
    history = createHistory({ tree, source });
    editor.value = source; preview.replaceChildren(initialPreview); valid = true; error.textContent = '';
    notify(null, tree);
  } catch (caught) { blocked = true; report(caught); }
  buttons();

  editor.addEventListener('input', () => {
    if (blocked) return;
    try {
      const tree = parseHTML(editor.value);
      preview.replaceChildren(render(tree, actual.ownerDocument));
      valid = true; error.textContent = '';
    } catch (caught) { valid = false; report(caught); }
    buttons();
  });

  // Adopt history only after every visible part has committed; failure restores the old display.
  function transition(candidate, navigate) {
    const previous = snapshot(), target = candidate.entries[candidate.index];
    const oldSource = editor.value, oldPreview = [...preview.childNodes], oldValid = valid;
    try {
      const plan = diff(previous.tree, target.tree);
      const targetPreview = navigate ? render(target.tree, actual.ownerDocument) : null;
      try {
        patch(singleRoot(actual), plan);
        if (navigate) { preview.replaceChildren(targetPreview); editor.value = target.source; valid = true; }
      } catch (caught) {
        try {
          actual.replaceChildren(render(previous.tree, actual.ownerDocument));
          if (navigate) { preview.replaceChildren(...oldPreview); editor.value = oldSource; valid = oldValid; }
          notify(null, previous.tree, true);
        } catch (recoveryError) {
          blocked = true;
          notify(null, null, true);
          throw new Error(`복구에 실패했습니다. 새로고침이 필요합니다. (${recoveryError.message})`);
        }
        throw new Error(`화면 적용에 실패해 이전 상태로 복구했습니다. (${caught.message})`);
      }
      history = candidate; error.textContent = ''; buttons();
      notify(plan, target.tree);
    } catch (caught) { report(caught); }
  }
  patchButton.addEventListener('click', () => {
    if (blocked || !valid) return;
    try {
      const parsed = parseHTML(editor.value), tree = readDom(singleRoot(preview));
      if (!sameTree(parsed, tree)) throw new Error('입력 코드와 미리보기가 다릅니다. 코드를 다시 편집해 주세요.');
      transition(commitHistory(history, { tree, source: editor.value }), false);
    } catch (caught) { valid = false; report(caught); }
  });
  function navigate(direction) {
    if (blocked) return;
    try {
      const candidate = moveHistory(history, direction);
      if (candidate.index !== history.index) transition(candidate, true);
    } catch (caught) { report(caught); }
  }
  backButton.addEventListener('click', () => navigate(-1));
  forwardButton.addEventListener('click', () => navigate(1));
}
