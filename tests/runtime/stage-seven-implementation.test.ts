import { expect, it } from 'vitest';
import { FunctionComponent } from '../../src/core/component';
import { useEffect, useState } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';

it('[EFF-01 EFF-02 EFF-03 EFF-04] commits before effects, retains equal deps, cleans up before rerun and removal', () => {
  const container = document.createElement('div');
  const events: string[] = [];
  let setValue!: (value: number) => void;
  const root = new FunctionComponent(() => {
    const [value, set] = useState(0);
    setValue = set;
    useEffect(() => {
      events.push(`setup:${value}:${container.textContent}`);
      return () => { events.push(`cleanup:${value}`); };
    }, [value]);
    return h('p', null, value);
  });
  root.mount(container, {});
  root.update();
  setValue(1);
  root.unmount();
  expect(events).toEqual(['setup:0:0', 'cleanup:0', 'setup:1:1', 'cleanup:1']);
});
