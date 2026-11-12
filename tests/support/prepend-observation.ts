export interface PrependObservation {
  readonly beforeKeys: readonly string[];
  readonly afterKeys: readonly string[];
  // One strict-reference comparison for EVERY key present immediately before insertion.
  readonly sameNodes: readonly boolean[];
}

/** Test assertion only: never performs insertion, key matching or rendering for the app. */
export function assertPrepend({ beforeKeys, afterKeys, sameNodes }: PrependObservation): void {
  if (afterKeys.length !== beforeKeys.length + 1) {
    throw new Error('Prepend must add exactly one item');
  }
  if (!afterKeys[0] || beforeKeys.includes(afterKeys[0])) {
    throw new Error('The first item must have a new, nonempty key');
  }
  if (new Set(afterKeys).size !== afterKeys.length) {
    throw new Error('Prepend must not duplicate keys');
  }
  beforeKeys.forEach((key, index) => {
    if (afterKeys[index + 1] !== key) throw new Error(`Existing key order changed: ${key}`);
  });
  if (sameNodes.length !== beforeKeys.length || sameNodes.some((same) => !same)) {
    throw new Error('Every existing key must retain its exact DOM object');
  }
}
