import { expect } from 'vitest';

/** DOM structural equality is insufficient when the contract preserves object identity. */
export function expectSameNodes(actual: ArrayLike<Node>, expected: readonly Node[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((node, index) => expect(actual[index]).toBe(node));
}
