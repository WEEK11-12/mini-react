import { FunctionComponent } from '../../src/core/component';
import { h, type Child } from '../../src/core/vdom';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

// Native fault injection and observations only; no replacement product logic.
export type CaseName = 'release-before-removal' | 'removal-after-write' | 'repeated-removal-failure' | 'successful-recovery-error' | 'update-clear-failure' | 'mount-clear-failure';
export function runCase(name: CaseName): Record<string, unknown> {
  const host = document.createElement('div'); document.body.append(host);
  const restorers: (() => void)[] = [];
  let cleanup: (() => void) | undefined;
  const ownsScope = (): boolean => {
    try { const scope = createDOMScope(host); releaseDOMScope(scope); return false; } catch { return true; }
  };
  try {
    if (name === 'release-before-removal') {
      let calls = 0; const handler = (): void => { calls += 1; };
      const render = (): Child => h('section', { events: { click: handler } }, h('button', { events: { click: handler } }, 'go'), h('input', { events: { input: handler, change: handler } }));
      const root = new FunctionComponent(render); cleanup = () => root.unmount(); root.mount(host, {});
      const section = host.querySelector('section')!; const button = host.querySelector('button')!; const input = host.querySelector('input')!;
      const dispatch = (): void => { section.dispatchEvent(new Event('click')); button.dispatchEvent(new Event('click')); input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); };
      dispatch(); const baseline = calls; const removals: string[] = [];
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.removeEventListener = function (type, listener, options) { if (listener === handler) removals.push(type); return remove.call(this, type, listener, options); };
      restorers.push(() => { EventTarget.prototype.removeEventListener = remove; });
      const replace = host.replaceChildren.bind(host); let phaseDuringRemoval: string | undefined; let callsDuringRemoval: number | undefined;
      host.replaceChildren = (...nodes) => { phaseDuringRemoval = root.phase; dispatch(); callsDuringRemoval = calls; replace(...nodes); };
      restorers.push(() => { host.replaceChildren = replace; });
      root.unmount(); dispatch(); root.unmount();
      const result = { baseline, callsDuringRemoval, callsAfterRemoval: calls, phaseDuringRemoval, phase: root.phase, count: host.childNodes.length, removals: removals.sort(), scopeReleased: !ownsScope() };
      return result;
    }
    if (name === 'removal-after-write' || name === 'repeated-removal-failure') {
      let calls = 0; let removals = 0; const handler = (): void => { calls += 1; };
      const root = new FunctionComponent(() => h('button', { attrs: { id: 'field' }, events: { click: handler } }, 'alive'));
      cleanup = () => root.unmount(); root.mount(host, {}); const old = host.firstElementChild!; const oldId = old.id;
      old.dispatchEvent(new Event('click'));
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.removeEventListener = function (type, listener, options) { if (this === old && listener === handler) removals += 1; return remove.call(this, type, listener, options); };
      restorers.push(() => { EventTarget.prototype.removeEventListener = remove; });
      const replace = host.replaceChildren.bind(host); const failure = new Error('removal failure');
      host.replaceChildren = (...nodes) => { if (name === 'removal-after-write') replace(...nodes); throw failure; };
      restorers.push(() => { host.replaceChildren = replace; });
      const caught: unknown[] = []; const attempts = name === 'repeated-removal-failure' ? 2 : 1;
      for (let index = 0; index < attempts; index += 1) { try { root.unmount(); } catch (error) { caught.push(error); } old.dispatchEvent(new Event('click')); }
      const failurePhase = root.phase; const retained = ownsScope(); const connectedCount = host.childNodes.length;
      let updateRejected = false; let mountRejected = false;
      try { root.update(); } catch { updateRejected = true; } try { root.mount(host, {}); } catch { mountRejected = true; }
      host.replaceChildren = replace; root.unmount(); const released = !ownsScope(); root.mount(host, {}); host.firstElementChild!.dispatchEvent(new Event('click'));
      const result = { attempts, caughtOriginal: caught.length === attempts && caught.every(error => error === failure), failurePhase, retained, connectedCount, calls: calls - 1, removals, updateRejected, mountRejected, released, freshId: host.firstElementChild!.id !== oldId, restartedCalls: calls };
      root.unmount(); return result;
    }
    let calls = 0; const handler = (): void => { calls += 1; };
    const root = new FunctionComponent(({ value }: { value: string }) => h('button', { attrs: { title: value }, events: { click: handler } }, value));
    cleanup = () => root.unmount();
    const applicationError = new Error('application failed'); const recoveryError = new Error('recovery clear failed');
    const replace = host.replaceChildren.bind(host); const set = Element.prototype.setAttribute; const append = host.appendChild.bind(host);
    let old: Element | null = null; let applied = false; let recoveryAttempted = false;
    if (name !== 'mount-clear-failure') { root.mount(host, { value: 'old' }); old = host.firstElementChild; old!.dispatchEvent(new Event('click')); }
    if (name === 'mount-clear-failure') {
      host.appendChild = <T extends Node>(node: T): T => { append(node); old = host.firstElementChild; applied = host.childNodes.length === 1; throw applicationError; };
      restorers.push(() => { host.appendChild = append; });
    } else {
      Element.prototype.setAttribute = function (attribute, value) { set.call(this, attribute, value); if (this === old && attribute === 'title' && value === 'new') { applied = this.getAttribute(attribute) === 'new'; throw applicationError; } };
      restorers.push(() => { Element.prototype.setAttribute = set; });
    }
    if (name !== 'successful-recovery-error') {
      host.replaceChildren = () => { recoveryAttempted = true; throw recoveryError; };
      restorers.push(() => { host.replaceChildren = replace; });
    }
    let caught: unknown;
    try { if (name === 'mount-clear-failure') root.mount(host, { value: 'new' }); else root.update({ value: 'new' }); } catch (error) { caught = error; }
    const errors = caught instanceof AggregateError ? Array.from(caught.errors) : [];
    old?.dispatchEvent(new Event('click')); host.firstElementChild?.dispatchEvent(new Event('click'));
    const failurePhase = root.phase; const retained = ownsScope(); const callsAtFailure = calls; const text = host.textContent;
    host.replaceChildren = replace; host.appendChild = append; Element.prototype.setAttribute = set;
    root.unmount(); const released = !ownsScope(); root.mount(host, { value: 'fresh' }); host.firstElementChild!.dispatchEvent(new Event('click')); const restarted = root.phase === 'idle' && calls === callsAtFailure + 1;
    root.unmount();
    if (name === 'successful-recovery-error') return { applied, sameApplicationError: caught === applicationError, aggregate: caught instanceof AggregateError, failurePhase, retained, callsAtFailure, text, released, restarted };
    return { applied, recoveryAttempted, aggregate: caught instanceof AggregateError, errorCount: errors.length, firstIsApplication: errors[0] === applicationError, secondIsRecovery: errors[1] === recoveryError, failurePhase, retained, callsAtFailure, text, released, restarted };
  } finally {
    for (const restore of restorers.reverse()) restore();
    cleanup?.(); host.remove();
  }
}
