import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from '../../src/core/component';
import { useState, type Setter } from '../../src/core/hooks';
import { h, type Child } from '../../src/core/vdom';
import { runChildCase, runFaultCase, runLifetimeCase, runLimitCase, runMountQueueCase, runQueueCase } from '../support/stage-six-review-cases';

const roots: FunctionComponent<unknown>[] = [];
function create<P>(render: (props: P) => Child): FunctionComponent<P> {
  const root = new FunctionComponent(render);
  roots.push(root as FunctionComponent<unknown>);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => root.unmount());
});

describe('stage 06 independent review', () => {
  it('[STA-01 STA-02 STA-03 COMP-03] stable setters, failed render rollback, lazy remount and stale generations', () => {
    expect(runLifetimeCase()).toEqual({ failed: true, failureState: 3, stable: true, sameDOM: true, initializes: 2, staleUpdaterCalls: 0, freshSetter: true, text: '3' });
  });
  it('[TECH-05 TECH-06] nested child Hook rejects, caught child error restores root context and h arguments remain root', () => {
    expect(runChildCase()).toEqual({ rejected: true, outsideRejected: true, slots: 3, text: '34' });
  });
  it('commit requests preserve FIFO, resolve omitted Props at processing and use latest committed State', () => {
    expect(runQueueCase()).toEqual({ renders: ['A:0', 'B:0', 'B:1', 'C:1', 'C:3', 'C:3'], during: ['committing', 0, 'A:0', 2], updaterInputs: [0, 1], text: 'C:3', state: 3, phase: 'idle', sameDOM: true });
  });
  it('initial mount queues setters until first State commit without batching', () => {
    expect(runMountQueueCase()).toEqual({ phaseDuringAppend: 'committing', renders: [0, 2, 6], text: '6', state: 6 });
  });
  it('partial DOM failure discards State and queued work, invalidates recovery/fault/remount setters and old events', () => {
    expect(runFaultCase()).toEqual({ failed: true, phase: 'faulted', text: '0', state: 0, ignoredCalls: 0, clicks: 0, updateRejected: true, recoveryPhases: ['recovering', 'unmounting'], freshSetter: true, freshText: '0' });
  });
  it.each(['state', 'props'] as const)('exactly 50 consecutive %s updates succeed synchronously', kind => {
    const result = runLimitCase(kind, 50);
    expect(result.caught).toBeNull();
    expect(result.updateRenders).toBe(50);
    expect(result.text).toBe('50');
    expect(result.phase).toBe('idle');
    expect(result.retryText).toBe('99');
  });
  it.each(['state', 'props'] as const)('51st consecutive %s update must not commit and queue is cleared for retry', kind => {
    const result = runLimitCase(kind, 51);
    console.log('LIMIT_OBSERVATION', JSON.stringify(result));
    expect.soft(result.caught).toBe('Too many consecutive updates');
    expect.soft(result.updateRenders).toBe(50);
    expect.soft(result.text).toBe('50');
    expect.soft(result.phase).toBe('idle');
    expect.soft(result.retryText).toBe('99');
  });
  it.each(['state', 'props'] as const)('unbounded %s commit chain stops and allows next independent request', kind => {
    const result = runLimitCase(kind, Number.POSITIVE_INFINITY);
    console.log('UNBOUNDED_OBSERVATION', JSON.stringify(result));
    expect(result.caught).toBe('Too many consecutive updates');
    expect(result.updateRenders).toBeLessThanOrEqual(50);
    expect(result.phase).toBe('idle');
    expect(result.retryText).toBe('99');
  });
  it.each(['fewer', 'more'] as const)('[STA-02] %s State calls discard candidate, preserve successful Props/slots and allow retry', mismatch => {
    const host = document.createElement('div');
    let invalid = false;
    let set!: Setter<number>;
    const root = create(({ label }: { label: string }) => {
      const [value, setter] = useState(1);
      set = setter;
      if (!invalid || mismatch !== 'fewer') useState(2);
      if (invalid && mismatch === 'more') useState(3);
      return h('p', null, `${label}:${value}`);
    });
    root.mount(host, { label: 'good' });
    const slots = root.hooks.slice();
    const node = host.firstChild;
    invalid = true;
    expect(() => set(9)).toThrow('Hook count changed');
    expect(() => root.update({ label: 'bad' })).toThrow('Hook count changed');
    expect(root.phase).toBe('idle');
    expect(root.hooks).toEqual(slots);
    expect(host.firstChild).toBe(node);
    expect(host.textContent).toBe('good:1');
    expect(() => useState(0)).toThrow();
    invalid = false;
    root.update();
    set(previous => previous + 2);
    expect(host.textContent).toBe('good:3');
  });
  it.each(['initializer', 'render', 'validation', 'child'] as const)('failed initial %s releases context and invalidates leaked setter before retry', failure => {
    const host = document.createElement('div');
    let invalid = true;
    let set!: Setter<number>;
    const root = create(() => {
      const [value, setter] = useState(() => { if (invalid && failure === 'initializer') throw new Error('initializer'); return 1; });
      set = setter;
      if (invalid && failure === 'render') throw new Error('render');
      if (invalid && failure === 'validation') return h('unsupported', null);
      if (invalid && failure === 'child') return h(() => { useState(99); return null; }, null);
      return h('p', null, value);
    });
    expect(() => root.mount(host, {})).toThrow();
    const stale = set;
    expect(root.phase).toBe('unmounted');
    expect(root.hooks).toEqual([]);
    expect(host.childNodes.length).toBe(0);
    expect(() => useState(0)).toThrow();
    invalid = false;
    root.mount(host, {});
    if (stale) {
      const updater = vi.fn((previous: number) => previous + 100);
      stale(updater);
      expect(updater).not.toHaveBeenCalled();
    }
    set(2);
    expect(host.textContent).toBe('2');
  });
  it.each(['setter', 'update', 'unmount'] as const)('render-time %s rejects without changing committed State or setter ownership', method => {
    const host = document.createElement('div');
    let invalid = false;
    let set!: Setter<number>;
    const root = create(() => {
      const [value, setter] = useState(1);
      set = setter;
      if (invalid) {
        if (method === 'setter') setter(9);
        else if (method === 'update') root.update();
        else root.unmount();
      }
      return h('p', null, value);
    });
    root.mount(host, {});
    const original = set;
    invalid = true;
    expect(() => set(2)).toThrow();
    expect(root.hooks[0].value).toBe(1);
    expect(root.phase).toBe('idle');
    expect(host.textContent).toBe('1');
    invalid = false;
    original(3);
    expect(set).toBe(original);
    expect(host.textContent).toBe('3');
  });
  it('updater exceptions and updater reentry preserve State and allow synchronous recovery', () => {
    const host = document.createElement('div');
    let set!: Setter<number>;
    const root = create(() => { const [value, setter] = useState(1); set = setter; return h('p', null, value); });
    root.mount(host, {});
    expect(() => set(() => { throw new Error('updater'); })).toThrow('updater');
    expect(() => set(() => { set(9); return 2; })).toThrow('Cannot update state during render');
    expect(() => set(() => { root.update(); return 2; })).toThrow();
    expect(root.phase).toBe('idle');
    expect(root.hooks[0].value).toBe(1);
    set(previous => previous + 1);
    expect(host.textContent).toBe('2');
  });
  it('[COMP-03 PATCH-03] keyed reorder and replacement keep root State, setter and surviving DOM identity', () => {
    const host = document.createElement('div');
    let set!: Setter<number>;
    const root = create(({ order }: { order: string[] }) => {
      const [value, setter] = useState(0);
      set = setter;
      return [h('p', null, value), h('ul', null, ...order.map(key => h(() => h('li', null, key), { key })))];
    });
    root.mount(host, { order: ['a', 'b', 'c'] });
    const original = set;
    const before = Array.from(host.querySelectorAll('li'));
    set(7);
    root.update({ order: ['c', 'a', 'b'] });
    const after = Array.from(host.querySelectorAll('li'));
    expect(after[0]).toBe(before[2]); expect(after[1]).toBe(before[0]); expect(after[2]).toBe(before[1]);
    root.update({ order: ['c', 'new', 'b'] });
    expect(set).toBe(original);
    expect(root.hooks[0].value).toBe(7);
    original(previous => previous + 1);
    expect(host.querySelector('p')!.textContent).toBe('8');
  });
  it('[STA-02 STA-03] two slots are independent; Object.is skips no-op render/mutations including same object reference', () => {
    const host = document.createElement('div');
    let setA!: Setter<number>;
    let setB!: Setter<object>;
    const object = {};
    let renders = 0;
    const root = create(() => {
      renders += 1;
      const [a, setterA] = useState(Number.NaN);
      const [b, setterB] = useState(object);
      setA = setterA; setB = setterB;
      return h('p', null, Object.is(a, -0) ? '-0' : String(a), b === object ? 'old' : 'new');
    });
    root.mount(host, {});
    const observer = new MutationObserver(() => undefined);
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true });
    setA(Number.NaN); setB(object);
    expect(renders).toBe(1);
    expect(observer.takeRecords()).toHaveLength(0);
    setA(0); setA(-0); setB({});
    expect(renders).toBe(4);
    expect(host.textContent).toBe('-0new');
    observer.disconnect();
  });
});
