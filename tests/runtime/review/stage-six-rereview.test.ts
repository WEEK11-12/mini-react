import { expect, it } from 'vitest';
import { runMountBudgetCase } from '../../support/stage-six-rereview-cases';

for (const kind of ['state', 'props'] as const) {
  for (const limit of [50, 51]) {
    it(`rereview F1: mount excluded from ${kind} ${limit} budget and retry resets the counter`, () => {
      const observed = runMountBudgetCase(kind, limit);
      expect(observed).toEqual({ kind, limit, initialPhase: 'committing', caught: limit === 50 ? null : 'Too many consecutive updates', phase: 'idle', text: '50', updateRenders: 50, updateCommits: 50, state: kind === 'state' ? 50 : 0, retryText: '99' });
    });
  }
}
