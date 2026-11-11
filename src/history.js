import { sameTree, validateVNode } from './vnode.js';

function invalid() {
  throw Object.assign(new Error('Invalid history state or snapshot'), { code: 'ERR_INVALID_HISTORY' });
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.source !== 'string') invalid();
  validateVNode(snapshot.tree);
}

function validateHistory(history) {
  if (!history || !Array.isArray(history.entries) || !history.entries.length
    || !Number.isInteger(history.index) || history.index < 0 || history.index >= history.entries.length) invalid();
  for (const entry of history.entries) validateSnapshot(entry);
}

function copySnapshot(snapshot) {
  return { tree: structuredClone(snapshot.tree), source: snapshot.source };
}

export function createHistory(initialSnapshot) {
  validateSnapshot(initialSnapshot);
  return { entries: [copySnapshot(initialSnapshot)], index: 0 };
}

export function commitHistory(history, snapshot) {
  validateHistory(history);
  validateSnapshot(snapshot);
  const saved = copySnapshot(snapshot);
  if (sameTree(history.entries[history.index].tree, snapshot.tree)) {
    const entries = [...history.entries];
    entries[history.index] = saved;
    return { entries, index: history.index };
  }
  return { entries: [...history.entries.slice(0, history.index + 1), saved], index: history.index + 1 };
}

export function moveHistory(history, direction) {
  validateHistory(history);
  if (direction !== -1 && direction !== 1) invalid();
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + direction));
  return { entries: history.entries, index };
}
