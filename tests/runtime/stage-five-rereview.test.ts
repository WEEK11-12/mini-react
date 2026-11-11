import { expect, it } from 'vitest';
import { runCase, type CaseName } from '../support/stage-five-rereview-cases';

const cases: [CaseName, Record<string, unknown>][] = [
  ['release-before-removal', { baseline: 4, callsDuringRemoval: 4, callsAfterRemoval: 4, phaseDuringRemoval: 'unmounting', phase: 'unmounted', count: 0, removals: ['change', 'click', 'click', 'input'], scopeReleased: true }],
  ['removal-after-write', { attempts: 1, caughtOriginal: true, failurePhase: 'faulted', retained: true, connectedCount: 0, calls: 1, removals: 1, updateRejected: true, mountRejected: true, released: true, freshId: true, restartedCalls: 2 }],
  ['repeated-removal-failure', { attempts: 2, caughtOriginal: true, failurePhase: 'faulted', retained: true, connectedCount: 1, calls: 1, removals: 1, updateRejected: true, mountRejected: true, released: true, freshId: true, restartedCalls: 2 }],
  ['successful-recovery-error', { applied: true, applicationPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 1, text: 'old', released: true, restarted: true }],
  ['update-clear-failure', { applied: true, recoveryAttempted: true, applicationPreserved: true, recoveryPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 1, text: 'old', released: true, restarted: true }],
  ['mount-clear-failure', { applied: true, recoveryAttempted: true, applicationPreserved: true, recoveryPreserved: true, failurePhase: 'faulted', retained: true, callsAtFailure: 0, text: 'new', released: true, restarted: true }],
];
it.each(cases)('[rereview] F1/F2 direct adjacent boundary: %s', (name, expected) => {
  expect(runCase(name)).toEqual(expected);
});
