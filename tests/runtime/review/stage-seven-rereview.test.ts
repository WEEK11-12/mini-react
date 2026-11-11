import { expect, it } from 'vitest';
import { runErrorBudget, runFatalAfterEffect, runDepsBoundary } from '../../support/stage-seven-rereview-cases';

for (const trigger of ['mount', 'props', 'setter'] as const) {
  for (const request of ['state', 'props'] as const) {
    for (const limit of [50, 51]) {
      it(`[F1 adjacent] ${trigger} / ${request} / ${limit}: repeated Effect errors retain one 50-update budget`, () => {
        const result = runErrorBudget(trigger, request, limit);
        console.log('REREVIEW_BUDGET', JSON.stringify({ trigger, request, limit, result }));
        expect(result).toEqual({ text: '50', phase: 'idle', updates: 50, effectFailures: trigger === 'mount' ? 51 : 50, limited: limit === 51, retryText: '99' });
      });
    }
  }
}
for (const failure of ['updater', 'render', 'patch'] as const) {
  it(`[F1 adjacent] ${failure} failure after an Effect error retains both causes and discards remaining requests`, () => {
    const result = runFatalAfterEffect(failure);
    console.log('REREVIEW_FATAL', JSON.stringify({ failure, result }));
    expect(result).toMatchObject({ phase: failure === 'patch' ? 'faulted' : 'idle', text: '1', state: 1, tailCalls: 0, setups: [0, 1], cleaned: [0], retryText: '5' });
    expect(result.errors).toContain('effect:original');
    expect(result.errors).toContain(`fatal:${failure}`);
  });
}
const expected = {
  holes: { setups: ['undefined|undefined', 'undefined|x', 'undefined|undefined'], cleanups: ['undefined|undefined', 'undefined|x'], text: 'undefined|undefined', rejected: false, finalCleanups: ['undefined|undefined', 'undefined|x', 'undefined|undefined'] },
  snapshot: { setups: ['1|2', 'undefined|2', 'undefined|3'], cleanups: ['1|2', 'undefined|2'], text: 'undefined|3', rejected: false, finalCleanups: ['1|2', 'undefined|2', 'undefined|3'] },
  'object-is': { setups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]', 'NaN|-0|[object Object]'], cleanups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]'], text: 'NaN|-0|[object Object]', rejected: false, finalCleanups: ['NaN|0|[object Object]', 'NaN|-0|[object Object]', 'NaN|-0|[object Object]'] },
  'shape-rollback': { setups: ['1|2', '1|3'], cleanups: ['1|2'], text: '1|3', rejected: true, finalCleanups: ['1|2', '1|3'] },
};
for (const kind of ['holes', 'snapshot', 'object-is', 'shape-rollback'] as const) {
  it(`[F2 adjacent] ${kind}: indexed dependency comparison preserves snapshots and rejection boundaries`, () => {
    const result = runDepsBoundary(kind);
    console.log('REREVIEW_DEPS', JSON.stringify({ kind, result }));
    expect(result).toEqual(expected[kind]);
  });
}
