import { FunctionComponent } from '../../src/core/component';
import { useMemo, useState, useEffect, type Setter } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Independent verification: ${message}`);
}
function rejected(run: () => unknown, message: string): unknown {
  try { run(); } catch (error) { return error; }
  throw new Error(`Expected rejection: ${message}`);
}
function contains(error: unknown, original: unknown): boolean {
  return error === original || error instanceof AggregateError && error.errors.some(item => contains(item, original));
}
function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}
export const cases: { name: string; run: () => void }[] = [];
function add(name: string, run: () => void) { cases.push({ name, run }); }

add('[MEMO-01~03 OPEN-11·13] Object.is, shallow snapshots, last-success A B A and exact result reference', () => {
  const host = fixture();
  let calls = 0;
  let result: object | undefined;
  const object = { n: 0 };
  const deps: unknown[] = [NaN, 0, object];
  const root = new FunctionComponent(() => {
    result = useMemo(() => ({ ordinal: ++calls }), deps);
    return h('p', null, calls);
  });
  try {
    root.mount(host, {});
    const first = result;
    const node = host.firstChild;
    object.n++;
    root.update();
    check(calls === 1 && result === first, 'same inner object and NaN must reuse result');
    deps[1] = -0; root.update();
    check(Number(calls) === 2 && result !== first, 'signed zero must invalidate');
    deps[1] = 0; root.update();
    check(Number(calls) === 3 && result !== first, 'A B A is not all-history cache');
    deps[2] = { n: 1 }; root.update();
    check(Number(calls) === 4, 'new equal-content object invalidates');
    const latest = result; root.update();
    check(Number(calls) === 4 && result === latest, 'changed result becomes next cache');
    check(host.firstChild === node, 'reusable DOM must survive memo recalculation');
  } finally { root.unmount(); host.remove(); }
});

add('[MEMO-02 OPEN-11] sparse positions and explicit undefined use indexed Object.is comparison', () => {
  const host = fixture();
  let calls = 0;
  let deps: unknown[] = new Array(2);
  const root = new FunctionComponent(() => { useMemo(() => ++calls, deps); return h('p', null, calls); });
  try {
    root.mount(host, {});
    deps = [undefined, undefined]; root.update();
    check(calls === 1, 'holes and explicit undefined are equal');
    deps[1] = 'x'; root.update();
    check(Number(calls) === 2, 'hole to value invalidates');
    delete deps[1]; root.update();
    check(Number(calls) === 3, 'value to hole invalidates despite skipped array iteration');
    deps[0] = 'y'; root.update();
    check(Number(calls) === 4, 'outer deps must have been copied');
    delete deps[0]; root.update();
    check(Number(calls) === 5, 'first index deletion invalidates');
  } finally { root.unmount(); host.remove(); }
});

for (const value of [undefined, null, false, 0, '', () => 1]) {
  add(`[MEMO-01·02] falsy/function result ${String(value)} remains cached with empty deps`, () => {
    const host = fixture();
    let calls = 0;
    let observed: unknown;
    const root = new FunctionComponent(() => {
      observed = useMemo(() => { calls++; return value; }, Object.freeze([]));
      return h('p', null, 'ok');
    });
    try {
      root.mount(host, {}); root.update(); root.update();
      check(calls === 1 && observed === value, 'cache cannot use result truthiness or callback identity');
    } finally { root.unmount(); host.remove(); }
  });
}

for (const [label, invalid] of [['omitted', undefined], ['null', null], ['object', { 0: 1, length: 1 }], ['string', 'x'], ['typed-array', new Uint8Array(1)]] as const) {
  add(`[OPEN-11] invalid deps ${label} rejected before calculation and failed mount retryable`, () => {
    const host = fixture();
    let calls = 0;
    let invalidMode = true;
    const root = new FunctionComponent(() => h('p', null, useMemo(() => ++calls, (invalidMode ? invalid : []) as readonly unknown[])));
    try {
      rejected(() => root.mount(host, {}), 'invalid deps');
      check(calls === 0 && root.phase === 'unmounted' && !host.firstChild && !root.hooks.length, 'invalid arguments must not calculate/commit');
      rejected(() => useMemo(() => 1, []), 'active context cleared');
      invalidMode = false; root.mount(host, {});
      check(Number(calls) === 1 && host.textContent === '1', 'valid retry must work');
    } finally { root.unmount(); host.remove(); }
  });
}
for (const invalid of [null, 12]) {
  add(`[OPEN-11] invalid calculate ${invalid} rejected even on cached deps`, () => {
    const host = fixture();
    const root = new FunctionComponent(({ bad }: { bad: boolean }) => h('p', null, useMemo((bad ? invalid : () => 'valid') as () => string, [])));
    try {
      root.mount(host, { bad: false });
      const slot = root.hooks[0]; const node = host.firstChild;
      rejected(() => root.update({ bad: true }), 'calculate type');
      check(root.hooks[0] === slot && host.firstChild === node && root.phase === 'idle', 'invalid cached call must preserve committed state');
      root.update(); check(host.textContent === 'valid', 'props rollback');
    } finally { root.unmount(); host.remove(); }
  });
}

for (const failure of ['calculate', 'render', 'validation', 'length', 'fewer', 'more'] as const) {
  add(`[candidate OPEN-15] ${failure}: discard State/Memo/Effect and retry from committed input`, () => {
    const host = fixture();
    let bad = false;
    let calls = 0;
    let setter!: Setter<number>;
    let memo: object | undefined;
    const setups: number[] = []; const cleanups: number[] = [];
    const original = new Error('owned-calculation-error');
    const root = new FunctionComponent(({ label }: { label: string }) => {
      const [state, set] = useState(0); setter = set;
      if (!(bad && failure === 'fewer')) memo = useMemo(() => {
        calls++; if (bad && failure === 'calculate') throw original;
        return { state };
      }, bad && failure === 'length' ? [state, label, 1] : [state, label]);
      useEffect(() => { setups.push(state); return () => { cleanups.push(state); }; }, [state]);
      if (bad && failure === 'more') useMemo(() => ({}), []);
      if (bad && failure === 'render') throw new Error('after memo');
      return h(bad && failure === 'validation' ? 'unsupported' : 'p', null, `${label}:${state}`);
    });
    try {
      root.mount(host, { label: 'good' });
      const slots = root.hooks.slice(); const saved = memo; const node = host.firstChild;
      bad = true;
      const error = rejected(() => setter(1), failure);
      if (failure === 'calculate') check(contains(error, original), 'original calculation error must be observable');
      rejected(() => root.update({ label: 'bad' }), 'props candidate');
      check(root.hooks.length === slots.length && slots.every((slot, i) => root.hooks[i] === slot), 'all committed slots must be preserved by identity');
      check(host.firstChild === node && host.textContent === 'good:0' && root.phase === 'idle', 'DOM and state rollback');
      check(setups.join() === '0' && cleanups.length === 0, 'pending effect never executes and old cleanup stays owned');
      rejected(() => useMemo(() => 1, []), 'context released');
      bad = false; const beforeRetry = calls; root.update();
      check(calls === beforeRetry && memo === saved && host.textContent === 'good:0', 'retry uses last-success cache and props');
      setter(1);
      check(Number(calls) === beforeRetry + 1 && memo !== saved && String(host.textContent) === 'good:1', 'next success calculates afresh');
      check(setups.join() === '0,1' && cleanups.join() === '0', 'coexisting effects commit after DOM');
    } finally { root.unmount(); host.remove(); }
  });
}
for (const direction of ['state-memo', 'effect-memo', 'memo-state', 'memo-effect'] as const) {
  add(`[OPEN-15] ${direction} kind transition rejected with original slots retained`, () => {
    const host = fixture();
    const [from, to] = direction.split('-');
    const root = new FunctionComponent(({ bad }: { bad: boolean }) => {
      const kind = bad ? to : from;
      if (kind === 'state') useState(0);
      else if (kind === 'effect') useEffect(() => undefined, []);
      else useMemo(() => ({}), []);
      return h('p', null, 'valid');
    });
    try {
      root.mount(host, { bad: false }); const slot = root.hooks[0]; const node = host.firstChild;
      rejected(() => root.update({ bad: true }), 'kind changed');
      check(root.hooks[0] === slot && host.firstChild === node, 'kind failure rollback');
      root.update(); check(root.hooks[0] === slot, 'retry from original props');
    } finally { root.unmount(); host.remove(); }
  });
}
add('[OPEN-15 TECH-05] child Memo rejected; caught child error restores root context', () => {
  const host = fixture(); let calls = 0;
  const Child = () => { useMemo(() => ++calls, []); return null; };
  const root = new FunctionComponent(() => {
    rejected(() => h(Child, null), 'child hook');
    const value = useMemo(() => ++calls, []);
    return h('p', null, value);
  });
  try {
    root.mount(host, {}); root.update();
    check(calls === 1 && host.textContent === '1' && root.hooks.length === 1, 'child must neither calculate nor consume root index');
  } finally { root.unmount(); host.remove(); }
});
add('[MEMO-01~03 STA EFF] mixed slots, native event, independent state and FIFO Effect updates', () => {
  const host = fixture(); let calls = 0; let setter!: Setter<number>;
  const logs: string[] = [];
  const root = new FunctionComponent(() => {
    const once = useMemo(() => ({}), []);
    const [count, set] = useState(0); setter = set;
    const derived = useMemo(() => { calls++; return { double: count * 2 }; }, [count]);
    useEffect(() => {
      logs.push(`${count}:${host.textContent}`);
      check(root.hooks[0]?.value === once && root.hooks[2]?.value === derived, 'memo committed before effect');
      if (count === 0) { set(p => p + 1); set(p => p + 2); }
    }, [count]);
    const [label, setLabel] = useState('a');
    return h('button', { events: { click: () => setLabel('b') } }, `${derived.double}:${label}`);
  });
  try {
    root.mount(host, {});
    check(calls === 3 && host.textContent === '6:a' && logs.join() === '0:0:a,1:2:a,3:6:a', 'FIFO must calculate from each successful State');
    const node = host.firstChild; const once = root.hooks[0]; const memo = root.hooks[2];
    host.querySelector('button')!.click();
    check(host.firstChild === node && String(host.textContent) === '6:b' && calls === 3 && root.hooks[0] === once && root.hooks[2] === memo, 'unrelated state must reuse memo and DOM');
    setter(4); check(Number(calls) === 4 && String(host.textContent) === '8:b', 'subsequent setter remains usable');
  } finally { root.unmount(); host.remove(); }
});
add('[candidate] Effect failure after successful DOM commit retains the new Memo result', () => {
  const host = fixture(); let calls = 0;
  const root = new FunctionComponent(({ dep }: { dep: number }) => {
    const memo = useMemo(() => ({ call: ++calls }), [dep]);
    useEffect(() => { if (dep === 1) throw new Error('post-commit effect'); }, [dep]);
    return h('p', null, memo.call);
  });
  try {
    root.mount(host, { dep: 0 });
    rejected(() => root.update({ dep: 1 }), 'effect failure');
    const slot = root.hooks[0];
    check(host.textContent === '2' && root.phase === 'idle', 'post-commit errors cannot roll back Memo');
    root.update(); check(root.hooks[0] === slot && calls === 2, 'new committed memo reused after Effect error');
  } finally { root.unmount(); host.remove(); }
});
for (const failure of ['partial', 'reconstruction', 'initial'] as const) {
  add(`[candidate recovery] ${failure}: discard cache candidate, fault and explicitly remount fresh`, () => {
    const host = fixture(); let calls = 0; let cleaned = 0; let setup = 0; let injected = false;
    let setter!: Setter<number>;
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0); setter = set;
      const memo = useMemo(() => ({ call: ++calls }), [value]);
      useEffect(() => { setup++; return () => { cleaned++; }; }, []);
      return h('p', { attrs: { title: String(value) } }, `${value}:${memo.call}`);
    });
    if (failure !== 'initial') root.mount(host, {});
    const committed = root.hooks[1]; const oldNode = host.firstElementChild;
    const native = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      native.call(this, name, value);
      if (name !== 'title') return;
      if (!injected && (failure === 'initial' || this === oldNode && value === '1')) { injected = true; throw new Error('native-partial'); }
      if (failure === 'reconstruction' && injected && this !== oldNode) throw new Error('native-reconstruction');
    };
    try {
      rejected(() => failure === 'initial' ? root.mount(host, {}) : setter(1), 'DOM failure');
    } finally { Element.prototype.setAttribute = native; }
    try {
      check(injected && root.phase === 'faulted', 'must reach actual partial write and fault');
      check(root.hooks[1] === committed && setup === (failure === 'initial' ? 0 : 1) && cleaned === setup, 'candidate not committed and old Effects cleaned once');
      rejected(() => root.update(), 'faulted update'); rejected(() => root.mount(host, {}), 'faulted mount');
      const count = calls; setter(9); check(calls === count, 'faulted setter inert');
      root.unmount(); root.mount(host, {});
      check(calls === count + 1 && root.hooks[1] !== committed && root.phase === 'idle', 'remount cannot reuse diagnostic cache');
    } finally { root.unmount(); host.remove(); }
  });
}

export function runCase(index: number): { ok: true } {
  const item = cases[index];
  if (!item) throw new Error('Unknown verification case');
  item.run();
  return { ok: true };
}
