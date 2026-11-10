import { expect, it } from 'vitest';
import { FunctionComponent } from '../../src/core/component';
import { useState } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';

it('[STA-01 STA-02 STA-03 COMP-03] 루트 슬롯은 실패한 렌더를 버리고 성공한 상태만 DOM에 확정한다', () => {
  const container = document.createElement('div');
  let setter!: (next: number | ((previous: number) => number)) => void;
  let invalid = false;
  const root = new FunctionComponent(() => {
    const [count, setCount] = useState(0);
    setter = setCount;
    if (invalid) throw new Error('render failed');
    return h('p', null, count);
  });
  root.mount(container, {});
  const node = container.firstChild;
  invalid = true;
  expect(() => setter(1)).toThrow('render failed');
  expect(root.hooks[0]?.value).toBe(0);
  expect(container.textContent).toBe('0');
  invalid = false;
  setter((previous) => previous + 2);
  expect(container.textContent).toBe('2');
  expect(container.firstChild).toBe(node);
  root.unmount();
  setter(9);
  expect(container.textContent).toBe('');
});
