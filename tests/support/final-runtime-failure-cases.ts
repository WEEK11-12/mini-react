import { FunctionComponent } from '../../src/core/component';
import { useEffect, useState, type Setter } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

// Independent native fault injection; the actual runtime owns all state and DOM work.
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Runtime failure contract: ${message}`);
}
function rejected(run: () => unknown, message: string): unknown {
  try { run(); } catch (error) { return error; }
  throw new Error(`Expected rejection: ${message}`);
}
function contains(error: unknown, original: unknown, seen = new Set<unknown>()): boolean {
  if (error === original) return true;
  if (!error || typeof error !== 'object' || seen.has(error)) return false;
  seen.add(error);
  return (error instanceof AggregateError && Array.from(error.errors).some(item => contains(item, original, seen))) ||
    ('cause' in error && contains(error.cause, original, seen));
}
function scopeHeld(host: Element): boolean {
  let scope;
  try {
    scope = createDOMScope(host);
  } catch { return true; }
  // A fresh scope can also own nonempty DOM. Release only our probe scope after
  // temporarily detaching those nodes; a release error is not overlap evidence.
  const fragment = host.ownerDocument.createDocumentFragment();
  try {
    while (host.firstChild) Node.prototype.appendChild.call(fragment, host.firstChild);
    releaseDOMScope(scope);
  } finally { Node.prototype.appendChild.call(host, fragment); }
  return false;
}
function fixture(): HTMLDivElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}
export const cases: { name: string; run: () => void }[] = [];

for (const mode of ['prepare', 'connect', 'connect-and-recovery-clear'] as const) {
  cases.push({
    name: `FINAL-R01-${mode} [PATCH-02 COMP-03][임시 OPEN-08·09] 최초 mount native ${mode} 실패는 candidate·대기열을 폐기하고 명시적 제거 뒤 새 수명을 시작한다`,
    run: () => {
      const host = fixture();
      const nativeSet = Element.prototype.setAttribute;
      const nativeAppend = host.appendChild;
      const nativeClear = host.replaceChildren;
      const failure = new Error('initial native failure');
      const recoveryFailure = new Error('initial recovery clear failure');
      let setter!: Setter<number>;
      let setups = 0;
      let cleanups = 0;
      let calls = 0;
      let writes = 0;
      let queuedUpdaterCalls = 0;
      let captured: Element | undefined;
      const root = new FunctionComponent(() => {
        const [value, update] = useState(0);
        setter = update;
        useEffect(() => { setups++; return () => { cleanups++; }; }, []);
        return [h('button', { events: { click: () => { calls++; } } }, value), h('p', { attrs: { title: 'initial' } }, 'tail')];
      });
      try {
        if (mode === 'prepare') {
          Element.prototype.setAttribute = function (name, value) {
            nativeSet.call(this, name, value);
            if (name === 'title' && value === 'initial') {
              Element.prototype.setAttribute = nativeSet;
              writes++;
              check(this.getAttribute(name) === value && !this.isConnected, 'native prepared write happened before failure');
              setter(() => { queuedUpdaterCalls++; return 4; });
              throw failure;
            }
          };
        } else {
          host.appendChild = function <T extends Node>(node: T): T {
            const result = nativeAppend.call(this, node) as T;
            host.appendChild = nativeAppend;
            captured = host.firstElementChild ?? undefined;
            writes++;
            check(host.childNodes.length === 2 && captured?.isConnected, 'initial fragment connected before failure');
            if (!captured) throw new Error('Connected fragment did not contain its button');
            captured.dispatchEvent(new Event('click'));
            setter(() => { queuedUpdaterCalls++; return 4; });
            if (mode === 'connect-and-recovery-clear') {
              host.replaceChildren = function () {
                host.replaceChildren = nativeClear;
                throw recoveryFailure;
              };
            }
            throw failure;
          };
        }
        const error = rejected(() => root.mount(host, {}), 'initial native failure');
        check(writes === 1 && contains(error, failure), 'original native failure preserved');
        check(mode !== 'connect-and-recovery-clear' || contains(error, recoveryFailure), 'recovery error preserved separately');
        check(root.phase === 'faulted' && root.hooks.length === 0, 'initial candidate never committed');
        check(setups === 0 && cleanups === 0 && queuedUpdaterCalls === 0, 'no initial Effect or queued updater executed');
        check(scopeHeld(host), 'failed mount retains scope even if recovery emptied DOM');
        if (mode !== 'connect-and-recovery-clear') check(host.childNodes.length === 0, 'no successful tree means empty recovery');
        else check(host.childNodes.length === 2, 'failed clear is not silently reported as removal');
        captured?.dispatchEvent(new Event('click'));
        check(calls === (mode === 'prepare' ? 0 : 1), 'connected failed-mount handler is detached');
        const oldSetter = setter;
        oldSetter(() => { queuedUpdaterCalls++; return 5; });
        rejected(() => root.update(), 'faulted update');
        rejected(() => root.mount(host, {}), 'faulted mount');
        check(queuedUpdaterCalls === 0, 'failed-generation setter inert');
        root.unmount();
        check(root.phase === 'unmounted' && !scopeHeld(host), 'explicit removal releases scope');
        root.mount(host, {});
        check(setter !== oldSetter && Number(setups) === 1 && host.textContent === '0tail', 'fresh mount initializes new hooks and Effect');
        oldSetter(7);
        check(host.textContent === '0tail', 'old setter cannot affect new lifetime');
        setter(2);
        check(host.textContent === '2tail', 'fresh setter works after initial failure');
        root.unmount();
        check(Number(cleanups) === 1, 'only successful lifetime cleanup runs');
      } finally {
        Element.prototype.setAttribute = nativeSet;
        host.appendChild = nativeAppend;
        host.replaceChildren = nativeClear;
        root.unmount();
        host.remove();
      }
    },
  });
}

for (const timing of ['before-write', 'after-write'] as const) {
  for (const cleanupFails of [false, true]) {
    cases.push({
      name: `FINAL-R02-${timing}-${cleanupFails} [EFF-04 PATCH-02][임시 OPEN-08·09] DOM 제거 ${timing} 실패와 cleanup 오류 ${cleanupFails}는 원인·scope를 보존하고 정리 중복 없이 제거 재시도한다`,
      run: () => {
        const host = fixture();
        const nativeClear = host.replaceChildren;
        const failure = new Error('native removal failure');
        const cleanupFailure = new Error('first cleanup failure');
        let shouldFailCleanup = cleanupFails;
        let setter!: Setter<number>;
        let calls = 0;
        let resourceCalls = 0;
        let liveResources = 0;
        const order: string[] = [];
        const root = new FunctionComponent(() => {
          const [value, update] = useState(0);
          setter = update;
          for (const label of ['first', 'second']) {
            useEffect(() => {
              const listener = () => { resourceCalls++; };
              window.addEventListener('final-runtime-resource', listener);
              liveResources++;
              return () => {
                order.push(label);
                window.removeEventListener('final-runtime-resource', listener);
                liveResources--;
                if (label === 'first' && shouldFailCleanup) throw cleanupFailure;
              };
            }, []);
          }
          return h('button', { events: { click: () => { calls++; } } }, value);
        });
        try {
          root.mount(host, {});
          const node = host.firstElementChild!;
          node.dispatchEvent(new Event('click'));
          window.dispatchEvent(new Event('final-runtime-resource'));
          check(calls === 1 && resourceCalls === 2 && liveResources === 2, 'normal native event/resource control');
          let removalCalls = 0;
          host.replaceChildren = function (...nodes) {
            removalCalls++;
            check(root.phase === 'unmounting' && liveResources === 0, 'all cleanups attempted before native removal');
            node.dispatchEvent(new Event('click'));
            check(calls === 1, 'VDOM events detached before native removal');
            if (timing === 'after-write') nativeClear.apply(this, nodes);
            throw failure;
          };
          const error = rejected(() => root.unmount(), 'native DOM removal failure');
          check(contains(error, failure) && (!cleanupFails || contains(error, cleanupFailure)), 'removal and cleanup original errors retained');
          check(order.join(',') === 'first,second' && removalCalls === 1, 'later cleanup continues exactly once');
          check(root.phase === 'faulted' && scopeHeld(host), 'scope retained after failed removal even if empty');
          check(host.childNodes.length === (timing === 'before-write' ? 1 : 0), 'native removal outcome observed');
          window.dispatchEvent(new Event('final-runtime-resource'));
          node.dispatchEvent(new Event('click'));
          check(resourceCalls === 2 && calls === 1, 'resources and old VDOM events inactive');
          let invalidUpdaterCalls = 0;
          const oldSetter = setter;
          oldSetter(() => { invalidUpdaterCalls++; return 9; });
          rejected(() => root.update(), 'faulted direct update');
          rejected(() => root.mount(host, {}), 'faulted direct mount');
          check(invalidUpdaterCalls === 0, 'failed-removal setter inert');
          host.replaceChildren = nativeClear;
          root.unmount();
          check(root.phase === 'unmounted' && !root.hooks.length && !scopeHeld(host), 'retry clears hooks and releases owned scope');
          check(order.join(',') === 'first,second', 'retry never duplicates consumed cleanup');
          shouldFailCleanup = false;
          root.mount(host, {});
          check(setter !== oldSetter && liveResources === 2, 'new lifetime creates fresh setter/resources');
          oldSetter(8);
          setter(3);
          check(host.textContent === '3', 'only fresh setter can update remounted DOM');
          root.unmount();
          check(order.join(',') === 'first,second,first,second' && Number(liveResources) === 0, 'new lifetime owns exactly its own cleanup');
        } finally {
          shouldFailCleanup = false;
          host.replaceChildren = nativeClear;
          root.unmount();
          host.remove();
        }
      },
    });
  }
}

for (const operation of ['mount', 'update'] as const) {
  cases.push({
    name: `FINAL-R03-${operation} [COMP-03 EFF-04][임시 OPEN-08·09] ${operation} committing native 콜백의 직접 unmount는 부수 변경 없이 거부하고 원래 커밋을 계속한다`,
    run: () => {
      const host = fixture();
      const nativeAppend = host.appendChild;
      const nativeSet = Element.prototype.setAttribute;
      let setter!: Setter<number>;
      let setups = 0;
      let cleanups = 0;
      let attempts = 0;
      const root = new FunctionComponent(() => {
        const [value, update] = useState(0);
        setter = update;
        useEffect(() => { setups++; return () => { cleanups++; }; }, []);
        return h('p', { attrs: { title: String(value) } }, value);
      });
      function attempt(): void {
        attempts++;
        check(root.phase === 'committing', 'reentry reached committing, not rendering/effects');
        const first = host.firstChild;
        const hookRefs = root.hooks.slice();
        rejected(() => root.unmount(), 'committing reentrant removal');
        check(root.phase === 'committing' && host.firstChild === first && cleanups === 0, 'rejected removal changes neither phase/DOM nor cleanup');
        check(root.hooks.length === hookRefs.length && hookRefs.every((slot, index) => root.hooks[index] === slot), 'committed hooks unchanged during rejected removal');
      }
      try {
        if (operation === 'mount') {
          host.appendChild = function <T extends Node>(node: T): T {
            host.appendChild = nativeAppend;
            const result = nativeAppend.call(this, node) as T;
            attempt();
            return result;
          };
          root.mount(host, {});
        } else {
          root.mount(host, {});
          const target = host.firstElementChild;
          Element.prototype.setAttribute = function (name, value) {
            nativeSet.call(this, name, value);
            if (this === target && name === 'title' && value === '1') {
              Element.prototype.setAttribute = nativeSet;
              attempt();
            }
          };
          setter(1);
        }
        check(attempts === 1 && root.phase === 'idle' && setups === 1 && cleanups === 0, 'original commit and Effect lifecycle finish normally');
        const stableSetter = setter;
        const previous = host.firstChild;
        setter(2);
        check(setter === stableSetter && host.firstChild === previous && host.textContent === '2', 'rejection does not invalidate setter generation or reusable DOM');
        root.unmount();
        check(Number(cleanups) === 1, 'only later explicit unmount consumes cleanup');
      } finally {
        host.appendChild = nativeAppend;
        Element.prototype.setAttribute = nativeSet;
        root.unmount();
        host.remove();
      }
    },
  });
}

for (const source of ['cleanup-caught', 'cleanup-uncaught', 'native-caught'] as const) {
  cases.push({
    name: `FINAL-R04-${source} [PATCH-02 EFF-04][임시 OPEN-08·09] recovering ${source} 직접 unmount를 거부하고 나머지 정리·표시 복구·faulted 소유권을 유지한다`,
    run: () => {
      const host = fixture();
      const nativeSet = Element.prototype.setAttribute;
      const nativeClear = host.replaceChildren;
      const failure = new Error('partial commit before recovery reentry');
      let setter!: Setter<number>;
      let attempts = 0;
      let calls = 0;
      let removalError: unknown;
      const order: string[] = [];
      const root = new FunctionComponent(() => {
        const [value, update] = useState(0);
        setter = update;
        useEffect(() => () => {
          order.push('first');
          if (root.phase === 'recovering' && source !== 'native-caught') attempt(source === 'cleanup-uncaught');
        }, []);
        useEffect(() => () => { order.push('second'); }, []);
        return h('button', { attrs: { title: String(value) }, events: { click: () => { calls++; } } }, value);
      });
      function attempt(propagate: boolean): void {
        attempts++;
        check(root.phase === 'recovering', 'reentry reached recovering');
        const first = host.firstChild;
        removalError = rejected(() => root.unmount(), 'recovering removal');
        check(root.phase === 'recovering' && host.firstChild === first, 'rejection does not start recursive removal');
        if (propagate) throw removalError;
      }
      try {
        root.mount(host, {});
        const oldNode = host.firstElementChild!;
        oldNode.dispatchEvent(new Event('click'));
        Element.prototype.setAttribute = function (name, value) {
          nativeSet.call(this, name, value);
          if (this === oldNode && name === 'title' && value === '1') {
            Element.prototype.setAttribute = nativeSet;
            check(oldNode.getAttribute('title') === '1', 'partial native commit occurred');
            throw failure;
          }
        };
        if (source === 'native-caught') {
          host.replaceChildren = function (...nodes) {
            host.replaceChildren = nativeClear;
            attempt(false);
            nativeClear.apply(this, nodes);
          };
        }
        const error = rejected(() => setter(1), 'commit failure with recovering reentry');
        check(attempts === 1 && contains(error, failure), 'one rejected removal and preserved application error');
        check(source !== 'cleanup-uncaught' || contains(error, removalError), 'uncaught cleanup reentry error also preserved');
        check(order.join(',') === 'first,second', 'later cleanup continues after rejected removal');
        check(root.phase === 'faulted' && host.textContent === '0' && scopeHeld(host), 'last successful display reconstructed and scope retained');
        oldNode.dispatchEvent(new Event('click'));
        host.firstElementChild!.dispatchEvent(new Event('click'));
        check(calls === 1, 'old and recovered display handlers inactive');
        let invalidUpdaterCalls = 0;
        setter(() => { invalidUpdaterCalls++; return 2; });
        rejected(() => root.update(), 'faulted update');
        check(invalidUpdaterCalls === 0 && host.textContent === '0', 'faulted cannot resume');
        root.unmount();
        check(order.join(',') === 'first,second' && !scopeHeld(host), 'explicit removal releases scope without duplicate cleanup');
        root.mount(host, {});
        setter(3);
        check(host.textContent === '3', 'explicit remount restores working lifetime');
        root.unmount();
      } finally {
        Element.prototype.setAttribute = nativeSet;
        host.replaceChildren = nativeClear;
        root.unmount();
        host.remove();
      }
    },
  });
}

export function runCase(index: number): { ok: true } {
  const item = cases[index];
  if (!item) throw new Error(`Unknown runtime failure case: ${index}`);
  item.run();
  return { ok: true };
}
