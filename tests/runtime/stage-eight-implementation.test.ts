import { expect, it } from 'vitest';
import { FunctionComponent } from '../../src/core/component';
import { useMemo } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';

it('[MEMO-01~03] [임시 OPEN-11·13] 재사용·변경·실패한 candidate 폐기', () => {
  const container = document.createElement('div');
  const deps: unknown[] = [NaN];
  const values: object[] = [];
  const root = new FunctionComponent<{ fail: boolean }>(props => {
    const value = useMemo(() => {
      const result = {};
      values.push(result);
      return result;
    }, deps);
    if (props.fail) throw new Error('render failure');
    return h('p', null, String(values.indexOf(value)));
  });

  root.mount(container, { fail: false });
  const first = root.hooks[0];
  root.update();
  expect(root.hooks[0]).toBe(first);
  deps[0] = 1;
  expect(() => root.update({ fail: true })).toThrow('render failure');
  expect(root.hooks[0]).toBe(first);
  deps[0] = NaN;
  root.update();
  expect(root.hooks[0]).toBe(first);
  expect(values).toHaveLength(2);
  deps[0] = 1;
  root.update();
  expect(values).toHaveLength(3);
  expect(container.textContent).toBe('2');
  root.unmount();
});
