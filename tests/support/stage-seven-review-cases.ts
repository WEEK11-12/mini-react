import { FunctionComponent } from '../../src/core/component';
import { useEffect, useState, type Setter } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

export { FunctionComponent, useEffect, useState, h };
export function errorMessages(error: unknown): string[] {
  return error instanceof AggregateError
    ? [error.message, ...Array.from(error.errors).flatMap(errorMessages)]
    : [error instanceof Error ? error.message : String(error)];
}
function host(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}
export function runErrorQueueCase(trigger: 'mount' | 'props' | 'setter', failure: 'setup' | 'cleanup') {
  const container = host();
  const events: string[] = [];
  let setter!: Setter<number>;
  let armed = trigger === 'mount';
  let fired = false;
  const queueAndFail = () => {
    if (!armed || fired) return;
    fired = true;
    setter(previous => { events.push(`updater:${previous}`); return previous + 10; });
    root.update({ label: 'queued' });
    events.push(`queued:${root.phase}:${container.textContent}`);
    throw new Error(`owned-${failure}-failure`);
  };
  const root = new FunctionComponent(({ label }: { label: string }) => {
    const [value, set] = useState(0);
    setter = set;
    events.push(`render:${label}:${value}`);
    useEffect(() => {
      events.push(`setup:${label}:${value}`);
      if (failure === 'setup') queueAndFail();
      return () => {
        events.push(`cleanup:${label}:${value}`);
        if (failure === 'cleanup') queueAndFail();
      };
    }, [label, value]);
    useEffect(() => { events.push(`later:${label}:${value}`); }, [label, value]);
    return h('p', null, `${label}:${value}`);
  });
  let errors: string[] = [];
  try {
    if (trigger === 'mount') root.mount(container, { label: 'initial' });
    else {
      root.mount(container, { label: 'initial' });
      armed = true;
      if (trigger === 'setter') setter(1);
      else root.update({ label: 'changed' });
    }
  } catch (error) { errors = errorMessages(error); }
  const result = { text: container.textContent, phase: root.phase, state: root.hooks[0].value, errors, events: events.slice() };
  root.unmount();
  container.remove();
  return result;
}
export function runSparseCase() {
  const container = host();
  const observed: unknown[] = [];
  const cleanups: unknown[] = [];
  const root = new FunctionComponent(({ deps }: { deps: readonly unknown[] }) => {
    const value = deps[0];
    useEffect(() => {
      observed.push(value === undefined ? 'undefined' : value);
      return () => { cleanups.push(value === undefined ? 'undefined' : value); };
    }, deps);
    return h('p', null, String(value));
  });
  root.mount(container, { deps: [1] });
  root.update({ deps: new Array<unknown>(1) });
  const afterHole = { setups: observed.slice(), cleanups: cleanups.slice(), text: container.textContent };
  root.update({ deps: [undefined] });
  const afterExplicitUndefined = { setups: observed.slice(), cleanups: cleanups.slice() };
  root.unmount();
  container.remove();
  return { afterHole, afterExplicitUndefined, finalCleanups: cleanups };
}
export function runRecoveryCase(failure: 'partial' | 'reconstruction' | 'removal' | 'initial') {
  const container = host();
  const events: string[] = [];
  let setter!: Setter<number>;
  let ignored = 0;
  let effectCalls = 0;
  let vdomCalls = 0;
  const captured: Element[] = [];
  const cleaned: Element[] = [];
  const root = new FunctionComponent(() => {
    const [value, set] = useState(0);
    setter = set;
    useEffect(() => {
      const node = container.querySelector('button')!;
      captured.push(node);
      const listener = () => { effectCalls += 1; };
      node.addEventListener('review-resource', listener);
      events.push(`setup:first:${value}`);
      return () => {
        cleaned.push(node);
        node.removeEventListener('review-resource', listener);
        setter(() => { ignored += 1; return 100; });
        events.push(`cleanup:first:${root.phase}`);
        try { root.unmount(); } catch { events.push(`reentry-rejected:${root.phase}`); }
        if (failure === 'partial' || failure === 'reconstruction') throw new Error('cleanup-owned-failure');
      };
    }, []);
    useEffect(() => {
      events.push(`setup:second:${value}`);
      return () => { events.push(`cleanup:second:${root.phase}`); };
    }, [value]);
    return h('button', { attrs: { title: String(value) }, events: { click: () => { vdomCalls += 1; } } }, value);
  });
  let oldNode: Element | null = null;
  let errors: string[] = [];
  let injected = false;
  const nativeAttribute = Element.prototype.setAttribute;
  const nativeReplace = container.replaceChildren.bind(container);
  const nativeAppend = container.appendChild.bind(container);
  if (failure !== 'initial') {
    root.mount(container, {});
    oldNode = container.firstElementChild;
    oldNode!.dispatchEvent(new Event('review-resource'));
    oldNode!.dispatchEvent(new Event('click'));
  }
  const staleSetter = setter;
  try {
    if (failure === 'removal') {
      container.replaceChildren = () => { injected = true; throw new Error('native-removal-failure'); };
      root.unmount();
    } else if (failure === 'initial') {
      container.appendChild = <T extends Node>(node: T): T => {
        nativeAppend(node);
        oldNode = container.firstElementChild;
        injected = true;
        throw new Error('native-initial-failure');
      };
      root.mount(container, {});
    } else {
      Element.prototype.setAttribute = function (name: string, value: string) {
        nativeAttribute.call(this, name, value);
        if (this === oldNode && name === 'title' && value === '1') {
          injected = true;
          setter(() => { ignored += 1; return 100; });
          throw new Error('native-partial-failure');
        }
        if (failure === 'reconstruction' && injected && this !== oldNode && name === 'title' && value === '0') {
          throw new Error('native-reconstruction-failure');
        }
      };
      setter(1);
    }
  } catch (error) { errors = errorMessages(error); }
  finally {
    Element.prototype.setAttribute = nativeAttribute;
    container.replaceChildren = nativeReplace;
    container.appendChild = nativeAppend;
  }
  let updateRejected = false;
  let mountRejected = false;
  try { root.update(); } catch { updateRejected = true; }
  try { root.mount(container, {}); } catch { mountRejected = true; }
  if (staleSetter) staleSetter(() => { ignored += 1; return 100; });
  for (const node of [oldNode, container.firstElementChild]) {
    node?.dispatchEvent(new Event('review-resource'));
    node?.dispatchEvent(new Event('click'));
  }
  let scopeRetained = false;
  try { const scope = createDOMScope(container); releaseDOMScope(scope); } catch { scopeRetained = true; }
  const result = {
    injected, phase: root.phase, text: container.textContent, errors,
    updateRejected, mountRejected, scopeRetained, ignored, effectCalls, vdomCalls,
    cleanedOldNode: oldNode !== null && cleaned[0] === oldNode,
    events: events.slice(), removalDidNotDuplicate: false, freshLifetime: false,
  };
  const cleanCount = cleaned.length;
  root.unmount();
  result.removalDidNotDuplicate = cleaned.length === cleanCount;
  root.mount(container, {});
  result.freshLifetime = root.phase === 'idle' && container.textContent === '0'
    && captured.at(-1) !== oldNode && setter !== staleSetter;
  try { root.unmount(); } catch { /* Cleanup error is the deliberate fixture failure. */ }
  container.remove();
  return result;
}
