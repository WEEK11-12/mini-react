import { expect, it, vi } from 'vitest';
import { FunctionComponent, useEffect, useState, h, runErrorQueueCase, runSparseCase, runRecoveryCase, errorMessages } from '../support/stage-seven-review-cases';

for (const trigger of ['mount', 'props', 'setter'] as const) {
  for (const failure of ['setup', 'cleanup'] as const) {
    if (trigger === 'mount' && failure === 'cleanup') continue;
    it(`[EFF-01 STA-03] post-commit ${failure} error drains accepted FIFO requests: ${trigger}`, () => {
      const observed = runErrorQueueCase(trigger, failure);
      console.log('ERROR_QUEUE_OBSERVATION', JSON.stringify({ trigger, failure, observed }));
      expect(observed.errors).toContain(`owned-${failure}-failure`);
      expect(observed.phase).toBe('idle');
      expect(observed.text).toBe(`queued:${trigger === 'setter' ? 11 : 10}`);
      expect(observed.state).toBe(trigger === 'setter' ? 11 : 10);
      expect(observed.events.findIndex(value => value.startsWith('later:'))).toBeLessThan(observed.events.findIndex(value => value.startsWith('updater:')));
    });
  }
}
it('[EFF-02 OPEN-11] sparse array positions compare as undefined using Object.is', () => {
  const observed = runSparseCase();
  console.log('SPARSE_OBSERVATION', JSON.stringify(observed));
  expect(observed).toEqual({
    afterHole: { setups: [1, 'undefined'], cleanups: [1], text: 'undefined' },
    afterExplicitUndefined: { setups: [1, 'undefined'], cleanups: [1] },
    finalCleanups: [1, 'undefined'],
  });
});
for (const failure of ['partial', 'reconstruction', 'removal', 'initial'] as const) {
  it(`[EFF-04 runtime] ${failure}: consume all cleanup once, retain scope, disable events/setters, require explicit remount`, () => {
    const observed = runRecoveryCase(failure);
    console.log('RECOVERY_OBSERVATION', JSON.stringify({ failure, observed }));
    expect(observed).toMatchObject({ injected: true, phase: 'faulted', ignored: 0, updateRejected: true, mountRejected: true, scopeRetained: true, removalDidNotDuplicate: true, freshLifetime: true });
    expect(observed.errors).toContain(`native-${failure === 'reconstruction' ? 'partial' : failure}-failure`);
    if (failure === 'partial' || failure === 'reconstruction') {
      expect(observed.errors).toContain('cleanup-owned-failure');
      expect(observed.events).toEqual(['setup:first:0', 'setup:second:0', 'cleanup:first:recovering', 'reentry-rejected:recovering', 'cleanup:second:recovering']);
      expect(observed.cleanedOldNode).toBe(true);
    }
    if (failure === 'reconstruction') expect(observed.errors).toContain('native-reconstruction-failure');
    expect(observed.effectCalls).toBe(failure === 'initial' ? 0 : 1);
    expect(observed.vdomCalls).toBe(failure === 'initial' ? 0 : 1);
    if (failure === 'partial' || failure === 'removal') expect(observed.text).toBe('0');
    if (failure === 'initial') expect(observed.events).toEqual([]);
  });
}
for (const mismatch of ['fewer', 'more', 'kind', 'shape', 'throw', 'validation'] as const) {
  it(`[EFF-02 OPEN-15] ${mismatch} render failure preserves State, Props, existing cleanup and DOM; retry uses committed deps`, () => {
    const container = document.createElement('div');
    const log: string[] = [];
    let invalid = false;
    let setter!: (next: number) => void;
    const root = new FunctionComponent(({ label }: { label: string }) => {
      const [value, set] = useState(0);
      setter = set;
      if (invalid && mismatch === 'kind') useState(1);
      else if (!(invalid && mismatch === 'fewer')) useEffect(() => {
        log.push(`setup:${value}`);
        return () => { log.push(`cleanup:${value}`); };
      }, invalid && mismatch === 'shape' ? [value, 'extra'] : [value]);
      if (invalid && mismatch === 'more') useEffect(() => undefined, []);
      if (invalid && mismatch === 'throw') throw new Error('render failed');
      return h(invalid && mismatch === 'validation' ? 'unsupported' : 'p', null, `${label}:${value}`);
    });
    root.mount(container, { label: 'good' });
    const node = container.firstChild;
    const slots = root.hooks.slice();
    invalid = true;
    expect(() => setter(1)).toThrow();
    expect(() => root.update({ label: 'bad' })).toThrow();
    expect(root.hooks).toEqual(slots);
    expect(root.phase).toBe('idle');
    expect(container.firstChild).toBe(node);
    expect(container.textContent).toBe('good:0');
    expect(log).toEqual(['setup:0']);
    expect(() => useEffect(() => undefined, [])).toThrow();
    invalid = false;
    root.update();
    expect(log).toEqual(['setup:0']);
    setter(2);
    expect(log).toEqual(['setup:0', 'cleanup:0', 'setup:2']);
    root.unmount();
    expect(log.at(-1)).toBe('cleanup:2');
  });
}
for (const invalid of [1, null, Promise.resolve(), 'invalid'] as const) {
  it(`[EFF-01] invalid setup return ${String(invalid)} reports API misuse without losing committed ownership`, () => {
    const container = document.createElement('div');
    const later = vi.fn();
    const root = new FunctionComponent(() => {
      useEffect((() => invalid) as unknown as () => void, []);
      useEffect(() => { later(); }, []);
      return h('p', null, 'committed');
    });
    expect(() => root.mount(container, {})).toThrow();
    expect(root.phase).toBe('idle');
    expect(container.textContent).toBe('committed');
    root.update();
    expect(later).toHaveBeenCalledTimes(1);
    root.unmount();
  });
}
it('[EFF-01 EFF-04] setup must reclaim resources if reentry propagates before returning cleanup', () => {
  const container = document.createElement('div');
  const active = new Set<object>();
  const returnedCleanup = vi.fn();
  const later = vi.fn();
  const root = new FunctionComponent(() => {
    useEffect(() => {
      const resource = {};
      active.add(resource);
      try { root.unmount(); } catch (error) { active.delete(resource); throw error; }
      return returnedCleanup;
    }, []);
    useEffect(() => { later(); }, []);
    return h('p', null, 'alive');
  });
  expect(() => root.mount(container, {})).toThrow();
  expect(active.size).toBe(0);
  expect(later).toHaveBeenCalledTimes(1);
  expect(root.phase).toBe('idle');
  root.unmount();
  expect(returnedCleanup).not.toHaveBeenCalled();
});
it('[EFF-02] omitted-deps failed setup retries next successful render; array setup retries only on dep change', () => {
  const container = document.createElement('div');
  let omitted = 0;
  let array = 0;
  let later = 0;
  const root = new FunctionComponent(({ dep }: { dep: number }) => {
    useEffect(() => { omitted += 1; throw new Error('omitted'); });
    useEffect(() => { array += 1; throw new Error('array'); }, [dep]);
    useEffect(() => { later += 1; });
    return h('p', null, dep);
  });
  expect(() => root.mount(container, { dep: 0 })).toThrow();
  expect(() => root.update()).toThrow();
  expect([omitted, array, later]).toEqual([2, 1, 2]);
  expect(() => root.update({ dep: 1 })).toThrow();
  expect([omitted, array, later]).toEqual([3, 2, 3]);
  root.unmount();
});
it('[EFF-03 EFF-04] two cleanup failures remain observable after full removal and are never repeated', () => {
  const container = document.createElement('div');
  const calls: number[] = [];
  const root = new FunctionComponent(() => {
    for (const number of [1, 2]) useEffect(() => () => { calls.push(number); throw new Error(`cleanup:${number}`); }, []);
    return h('p', null, 'remove');
  });
  root.mount(container, {});
  let errors: string[] = [];
  try { root.unmount(); } catch (error) { errors = errorMessages(error); }
  expect(errors).toEqual(['Component removal failed', 'cleanup:1', 'cleanup:2']);
  expect(root.phase).toBe('unmounted');
  expect(container.childNodes.length).toBe(0);
  root.unmount();
  expect(calls).toEqual([1, 2]);
});
for (const request of ['setter', 'props'] as const) {
  it(`[EFF-01] ${request} Effect update chain shares the 50-update guard and permits subsequent independent retry`, () => {
    const container = document.createElement('div');
    let enabled = true;
    let renders = 0;
    const root = new FunctionComponent(({ step }: { step: number }) => {
      const [value, setter] = useState(0);
      renders += 1;
      useEffect(() => {
        if (enabled) {
          if (request === 'setter') setter(previous => previous + 1);
          else root.update({ step: step + 1 });
        }
      });
      return h('p', null, request === 'setter' ? value : step);
    });
    expect(() => root.mount(container, { step: 0 })).toThrow('Too many consecutive updates');
    expect(renders).toBe(51);
    expect(container.textContent).toBe('50');
    enabled = false;
    root.update({ step: 99 });
    expect(root.phase).toBe('idle');
    root.unmount();
  });
}
