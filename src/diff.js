import { getKey, validateVNode } from './vnode.js';

export function diff(before, after) {
  validateVNode(before);
  validateVNode(after);
  const operations = [];

  function compareMap(type, oldMap = {}, newMap = {}, path) {
    const set = Object.fromEntries(Object.entries(newMap).filter(([key, value]) =>
      !Object.hasOwn(oldMap, key) || !Object.is(oldMap[key], value)));
    const remove = Object.keys(oldMap).filter((key) => !Object.hasOwn(newMap, key));
    if (Object.keys(set).length || remove.length) operations.push({ type, path, set, remove });
  }

  function compare(oldNode, newNode, path, index) {
    if (oldNode.kind !== newNode.kind || (oldNode.kind === 'element'
      && (oldNode.tag !== newNode.tag || getKey(oldNode) !== getKey(newNode)))) {
      operations.push({ type: 'replace', path, index, node: newNode });
      return false;
    }
    if (oldNode.kind === 'text') {
      if (oldNode.value !== newNode.value) operations.push({ type: 'text', path, value: newNode.value });
      return true;
    }
    compareMap('attrs', oldNode.attrs, newNode.attrs, path);
    compareMap('events', oldNode.events, newNode.events, path);
    compareMap('domProps', oldNode.domProps, newNode.domProps, path);
    const keyed = new Map();
    oldNode.children.forEach((child, oldIndex) => {
      if (getKey(child) !== undefined) keyed.set(getKey(child), oldIndex);
    });
    const used = new Set();
    newNode.children.forEach((child, newIndex) => {
      const key = getKey(child);
      const oldIndex = key !== undefined ? keyed.get(key)
        : (oldNode.children[newIndex] && getKey(oldNode.children[newIndex]) === undefined ? newIndex : undefined);
      if (oldIndex === undefined) {
        operations.push({ type: 'insert', path, index: newIndex, node: child });
        return;
      }
      used.add(oldIndex);
      const oldPath = [...path, oldIndex];
      const reused = compare(oldNode.children[oldIndex], child, oldPath, newIndex);
      if (reused && oldIndex !== newIndex) operations.push({ type: 'move', path: oldPath, index: newIndex });
    });
    oldNode.children.forEach((_, oldIndex) => {
      if (!used.has(oldIndex)) operations.push({ type: 'remove', path: [...path, oldIndex] });
    });
    return true;
  }

  compare(before, after, [], null);
  return { previous: before, next: after, operations };
}
