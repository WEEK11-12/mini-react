import { createDOMScope, releaseDOMScope, releaseNodeBindings, type DOMScope } from '../core/dom-bindings';
import { readDOM } from '../core/dom-reader';
import { diff } from '../core/diff';
import { applyPlan, mountTree } from '../core/patch';
import type { VRoot } from '../core/vdom';
import { HistoryStore } from './history';
import { parseHTML, serializeHTML } from './html-editor';

export interface PlaygroundElements {
  actual: HTMLElement;
  preview: HTMLElement;
  editor: HTMLTextAreaElement;
  patch: HTMLButtonElement;
  back: HTMLButtonElement;
  forward: HTMLButtonElement;
  status: HTMLElement;
}

export function startPlayground(view: PlaygroundElements): () => void {
  const initial = readDOM(view.actual);
  const history = new HistoryStore(initial);
  const actualScope = createDOMScope(view.actual);
  const previewScope = createDOMScope(view.preview);
  let appliedTree = history.current();
  let previewTree = appliedTree;
  let busy = false;
  let invalid = false;
  let stopped = false;
  let statusMessage = '';
  const listeners: (() => void)[] = [];

  function clear(container: HTMLElement, scope: DOMScope): void {
    for (const element of container.querySelectorAll('*')) releaseNodeBindings(scope, element);
    container.replaceChildren();
  }
  function rebuild(container: HTMLElement, tree: VRoot, scope: DOMScope): void {
    clear(container, scope);
    mountTree(container, tree, scope);
  }
  function controls(message: string): void {
    statusMessage = message;
    view.patch.disabled = busy || invalid || stopped;
    view.back.disabled = busy || stopped || !history.canBack();
    view.forward.disabled = busy || stopped || !history.canForward();
    view.preview.inert = invalid || stopped;
    view.editor.disabled = stopped;
    view.status.textContent = `적용 이력 ${history.position()} / ${history.count()} · ${message}`;
  }
  function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
  function recover(actual: VRoot, preview: VRoot, editor: string, error: unknown): void {
    try {
      rebuild(view.actual, actual, actualScope);
      rebuild(view.preview, preview, previewScope);
      view.editor.value = editor;
      controls(`오류: ${message(error)}`);
    } catch (recoveryError) {
      stopped = true;
      controls(`복구 실패. 새로고침하여 다시 시작하세요: ${message(recoveryError)}`);
    }
  }
  function listen(target: EventTarget, name: string, handler: EventListener): void {
    target.addEventListener(name, handler);
    listeners.push(() => target.removeEventListener(name, handler));
  }

  try {
    rebuild(view.actual, appliedTree, actualScope);
    rebuild(view.preview, previewTree, previewScope);
    view.editor.value = serializeHTML(appliedTree);
    controls('준비');
  } catch (error) {
    clear(view.actual, actualScope);
    clear(view.preview, previewScope);
    releaseDOMScope(actualScope);
    releaseDOMScope(previewScope);
    throw error;
  }

  listen(view.editor, 'input', () => {
    if (busy || stopped) return;
    let next: VRoot;
    try { next = parseHTML(view.editor.value, view.editor.ownerDocument); }
    catch (error) { invalid = true; controls(`입력 오류: ${message(error)} · 마지막 유효 미리보기를 유지합니다. HTML 입력을 수정하세요.`); return; }
    const previous = previewTree;
    busy = true;
    try {
      applyPlan(view.preview, diff(previewTree, next), previewScope);
      previewTree = next;
      invalid = false;
      controls('미적용 편집');
    } catch (error) {
      invalid = true;
      recover(appliedTree, previous, view.editor.value, error);
    } finally { busy = false; controls(statusMessage); }
  });

  const observePreview: EventListener = () => {
    if (busy || invalid || stopped) return;
    try {
      const next = readDOM(view.preview, previewScope);
      const html = serializeHTML(next);
      previewTree = next;
      view.editor.value = html;
      controls('미적용 편집');
    } catch (error) { invalid = true; controls(`입력 오류: ${message(error)} · 마지막 유효 미리보기를 유지합니다. HTML 입력을 수정하세요.`); }
  };
  const restoreActual: EventListener = () => {
    if (busy || stopped) return;
    try { applyPlan(view.actual, diff(appliedTree, appliedTree), actualScope); }
    catch (error) { recover(appliedTree, previewTree, view.editor.value, error); }
  };
  for (const name of ['input', 'change']) {
    listen(view.preview, name, observePreview);
    listen(view.actual, name, restoreActual);
  }

  function apply(offset?: -1 | 1): void {
    if (busy || stopped || (offset === undefined && invalid)) return;
    const target = offset === undefined ? undefined : history.peek(offset);
    if (offset !== undefined && !target) return;
    const previousPreview = previewTree;
    const previousEditor = view.editor.value;
    const previousInvalid = invalid;
    const discardEdit = offset !== undefined && (previousInvalid || statusMessage === '미적용 편집');
    busy = true;
    let result = '';
    try {
      const currentPreview = readDOM(view.preview, previewScope);
      const next = target ?? currentPreview;
      const html = serializeHTML(next);
      const plan = diff(appliedTree, next);
      applyPlan(view.actual, plan, actualScope);
      applyPlan(view.preview, diff(currentPreview, next), previewScope);
      view.editor.value = html;
      if (offset !== undefined) history.commitMove(offset);
      else if (plan.hasChanges) history.push(next);
      appliedTree = history.current();
      previewTree = next;
      invalid = false;
      result = offset !== undefined ? `이력 이동${discardEdit ? ' · 미적용 편집 폐기' : ''}` : plan.hasChanges ? '적용 완료' : '변경 없음';
    } catch (error) {
      invalid = previousInvalid;
      recover(appliedTree, previousPreview, previousEditor, error);
      result = statusMessage;
    } finally { busy = false; controls(result); }
  }
  listen(view.patch, 'click', () => apply());
  listen(view.back, 'click', () => apply(-1));
  listen(view.forward, 'click', () => apply(1));
  return () => {
    stopped = true;
    for (const remove of listeners) remove();
    clear(view.actual, actualScope);
    clear(view.preview, previewScope);
    releaseDOMScope(actualScope);
    releaseDOMScope(previewScope);
    controls('종료');
  };
}
