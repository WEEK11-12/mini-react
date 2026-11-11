import { diff } from './diff.js';
import { render, patch, releaseDom, validateDomTree } from './dom.js';

let context = null;
let rendering = null;
let evaluatingState = false;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
function withoutHooks(callback) {
  const previous = context; context = null;
  try { return callback(); } finally { context = previous; }
}
function slot(kind) {
  if (!context) fail('ERR_HOOK_CONTEXT', 'Hook은 루트 컴포넌트에서만 호출할 수 있습니다.');
  const frame = context, index = frame.index++, previous = frame.instance.hooks[index];
  if (frame.instance.mounted && (!previous || previous.kind !== kind)) {
    fail('ERR_HOOK_ORDER', 'Hook 종류와 호출 순서를 유지해야 합니다.');
  }
  return { frame, index, previous };
}
function dependencies(deps) {
  if (deps !== undefined && !Array.isArray(deps)) fail('ERR_INVALID_HOOK', '의존성은 배열이어야 합니다.');
  return deps === undefined ? undefined : [...deps];
}
const sameDeps = (before, after) => before !== undefined && after !== undefined
  && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));

export function useState(initial) {
  const { frame, index, previous } = slot('state');
  const generation = frame.instance.generation;
  const state = previous ? { ...previous } : {
    kind: 'state', value: typeof initial === 'function' ? withoutHooks(initial) : initial,
    setter: value => frame.instance.setState(index, value, generation),
  };
  if (frame.change?.index === index) state.value = frame.change.value;
  frame.hooks[index] = state;
  return [state.value, state.setter];
}

export function useMemo(factory, deps) {
  if (typeof factory !== 'function') fail('ERR_INVALID_HOOK', 'Memo 계산 함수가 필요합니다.');
  const copied = dependencies(deps), { frame, index, previous } = slot('memo');
  const value = previous && sameDeps(previous.deps, copied) ? previous.value : withoutHooks(factory);
  frame.hooks[index] = { kind: 'memo', value, deps: copied };
  return value;
}

export function useEffect(effect, deps) {
  if (typeof effect !== 'function') fail('ERR_INVALID_HOOK', 'Effect 함수가 필요합니다.');
  const copied = dependencies(deps), { frame, index, previous } = slot('effect');
  frame.hooks[index] = { kind: 'effect', deps: copied, cleanup: previous?.cleanup };
  if (!previous || !sameDeps(previous.deps, copied)) frame.effects.push({ index, effect });
}

export function renderChild(component, props = {}) {
  if (typeof component !== 'function') fail('ERR_INVALID_HOOK', '자식 컴포넌트 함수가 필요합니다.');
  return withoutHooks(() => component(props));
}

export class FunctionComponent {
  constructor(component, container, props = {}, { onError = error => console.error(error), onCommit, onRecovery } = {}) {
    if (typeof component !== 'function' || !container?.ownerDocument || typeof onError !== 'function') {
      fail('ERR_COMPONENT_LIFECYCLE', '컴포넌트 함수와 DOM 컨테이너가 필요합니다.');
    }
    this.component = component;
    this.container = container;
    this.props = props;
    this.onError = onError;
    this.onCommit = onCommit;
    this.onRecovery = onRecovery;
    this.hooks = [];
    this.vnode = null;
    this.root = null;
    this.mounted = false;
    this.blocked = false;
    this.generation = 0;
    this.flushing = false;
    this.disposed = false;
  }

  mount() {
    if (this.mounted || this.disposed || rendering || this.flushing) fail('ERR_COMPONENT_LIFECYCLE', 'mount 호출 순서가 잘못되었습니다.');
    this.generation++;
    return this.perform();
  }

  update() {
    this.requireMounted();
    if (rendering || this.flushing) fail('ERR_RENDER_UPDATE', '렌더·Effect 처리 중 직접 update할 수 없습니다.');
    return this.perform();
  }

  requireMounted() {
    if (!this.mounted || this.blocked) fail('ERR_COMPONENT_LIFECYCLE', '갱신 가능한 컴포넌트가 아닙니다.');
  }

  setState(index, action, generation) {
    if (rendering || evaluatingState) fail('ERR_RENDER_UPDATE', '렌더·State 계산 중 State를 변경할 수 없습니다.');
    this.requireMounted();
    if (generation !== this.generation) fail('ERR_COMPONENT_LIFECYCLE', '이전 컴포넌트의 setter입니다.');
    if (this.flushing) {
      queueMicrotask(() => {
        if (!this.mounted || generation !== this.generation) return;
        try { this.setState(index, action, generation); } catch (error) { this.onError(error); }
      });
      return;
    }
    const previous = this.hooks[index].value;
    let value = action;
    if (typeof action === 'function') {
      evaluatingState = true;
      try { value = withoutHooks(() => action(previous)); }
      finally { evaluatingState = false; }
    }
    if (!Object.is(previous, value)) this.perform({ index, value });
  }

  perform(change) {
    const previousContext = context, previousRendering = rendering;
    const frame = { instance: this, hooks: [], effects: [], index: 0, change };
    let next;
    context = frame; rendering = this;
    try {
      next = this.component(this.props);
      if (this.mounted && frame.index !== this.hooks.length) fail('ERR_HOOK_ORDER', 'Hook 개수가 달라졌습니다.');
      validateDomTree(next, { phase: 2 });
    } finally { context = previousContext; rendering = previousRendering; }

    let root, plan = null;
    if (this.mounted) {
      plan = diff(this.vnode, next);
      try { root = patch(this.root, plan, { phase: 2 }); }
      catch (error) {
        try {
          releaseDom(this.root);
          for (const child of this.container.childNodes) releaseDom(child);
          root = render(this.vnode, this.container.ownerDocument, { phase: 2 });
          this.container.replaceChildren(root);
          this.root = root;
          try { this.onRecovery?.({ root, tree: this.vnode }); }
          catch (observerError) { console.warn('시각화 복구 알림 실패', observerError); }
        } catch (recoveryError) {
          if (root) releaseDom(root);
          this.blocked = true;
          error.recoveryError = recoveryError;
          try { this.onRecovery?.({ root: null, tree: null }); }
          catch (observerError) { console.warn('시각화 복구 알림 실패', observerError); }
        }
        throw error;
      }
    } else {
      root = render(next, this.container.ownerDocument, { phase: 2 });
      try { this.container.append(root); } catch (error) { releaseDom(root); throw error; }
    }
    this.root = root;
    this.vnode = next;
    this.hooks = frame.hooks;
    this.mounted = true;
    try { this.onCommit?.({ plan, root, tree: next }); }
    catch (error) { console.warn('시각화 알림 실패', error); }
    this.flushEffects(frame.effects);
    return this.root;
  }

  flushEffects(effects) {
    let firstError;
    this.flushing = true;
    try {
      for (const { index, effect } of effects) {
        const hook = this.hooks[index], cleanup = hook.cleanup;
        hook.cleanup = undefined;
        try { cleanup?.(); } catch (error) { firstError ??= error; }
        try {
          const result = effect();
          if (result !== undefined && typeof result !== 'function') fail('ERR_INVALID_HOOK', 'Effect는 정리 함수 또는 undefined를 반환해야 합니다.');
          hook.cleanup = result;
        } catch (error) { firstError ??= error; }
      }
    } finally { this.flushing = false; }
    if (firstError) throw firstError;
  }

  unmount() {
    if (!this.mounted || rendering || this.flushing) fail('ERR_COMPONENT_LIFECYCLE', 'unmount 호출 순서가 잘못되었습니다.');
    this.mounted = false;
    this.disposed = true;
    this.generation++;
    let firstError;
    for (const hook of this.hooks) if (hook.kind === 'effect') {
      const cleanup = hook.cleanup; hook.cleanup = undefined;
      try { cleanup?.(); } catch (error) { firstError ??= error; }
    }
    try { releaseDom(this.root); } catch (error) { firstError ??= error; }
    for (const child of [...this.container.childNodes]) {
      try { releaseDom(child); } catch (error) { firstError ??= error; }
      try { child.remove(); } catch (error) { firstError ??= error; }
    }
    this.root = null;
    if (firstError) throw firstError;
  }
}
