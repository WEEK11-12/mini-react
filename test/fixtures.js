export const text = (value) => ({ kind: 'text', value });

export const element = (tag, children = [], attrs = {}) => ({
  kind: 'element',
  tag,
  attrs,
  children,
  events: {},
  domProps: {},
});

export const snapshot = (tree, source = '') => ({ tree, source });

// 공유 fixture를 수정하는 구현은 다음 테스트에 영향을 주기 전에 실패해야 한다.
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
