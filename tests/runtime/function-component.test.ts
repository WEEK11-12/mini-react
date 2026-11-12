import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';
import { expectSameNodes } from '../support/observations';

type Setter<T> = (next: T | ((previous: T) => T)) => void;
type Cleanup = () => void;
type EventName = 'click' | 'input' | 'change';
interface Props {
  readonly key?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly domProps?: Readonly<{ value?: string; checked?: boolean; disabled?: boolean }>;
  readonly events?: Readonly<Partial<Record<EventName, (event: Event) => void>>>;
  readonly children?: readonly Child[];
  readonly [name: string]: unknown;
}
interface VText {
  readonly kind: 'text';
  readonly value: string;
}
interface VElement {
  readonly kind: 'element';
  readonly tag: string;
  readonly key?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly domProps: Readonly<{ value?: string; checked?: boolean; disabled?: boolean }>;
  readonly events: Readonly<Partial<Record<EventName, (event: Event) => void>>>;
  readonly children: readonly VNode[];
}
type VNode = VText | VElement;
type Child = VNode | string | number | null | boolean | readonly Child[];
type Render<P> = (props: P) => Child;
type HookRecord =
  | { readonly kind: 'state'; readonly value: unknown }
  | { readonly kind: 'memo'; readonly value: unknown; readonly deps: readonly unknown[] }
  | { readonly kind: 'effect'; readonly deps: readonly unknown[] | undefined; readonly cleanup?: Cleanup };
interface Root<P> {
  readonly hooks: readonly HookRecord[];
  readonly phase: string;
  mount(container: Element, props: P): void;
  update(props?: P): void;
  unmount(): void;
}
interface ComponentModule {
  readonly FunctionComponent: new <P>(renderFn: Render<P>) => Root<P>;
}
interface VdomModule {
  h(type: string | Render<Props>, props: Props | null, ...children: Child[]): Child;
  text(value: string | number): VText;
}
interface HooksModule {
  useState<T>(initial: T | (() => T)): [T, Setter<T>];
  useEffect(setup: () => void | Cleanup, deps?: readonly unknown[]): void;
  useMemo<T>(calculate: () => T, deps: readonly unknown[]): T;
}

let component: ComponentModule;
let vdom: VdomModule;
let hooks: HooksModule;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.restoreAllMocks();
  // Each test reaches the parent loader; absent SUTs are explicit RED, not collection errors.
  component = await projectModule<ComponentModule>('core/component.ts');
  vdom = await projectModule<VdomModule>('core/vdom.ts');
  hooks = await projectModule<HooksModule>('core/hooks.ts');
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
});

// Fixture helpers only assert DOM existence; none implements runtime or Hook behavior.
function element(selector: string): Element {
  const found = container.querySelector(selector);
  if (!found) {
    throw new Error(`Expected mounted element: ${selector}`);
  }
  return found;
}

function host(value: string | number): Child {
  return vdom.h('p', null, vdom.text(value));
}

describe('FunctionComponent mount, props and state', () => {
  it('[COMP-01 COMP-02 TECH-03 TECH-04] mount executes the root and forwards props to a pure child', () => {
    const received: Props[] = [];
    const ChildComponent: Render<Props> = (props) => {
      received.push(props);
      return host(String(props.label));
    };
    const root = new component.FunctionComponent<{ label: string }>((props) =>
      vdom.h(ChildComponent, { label: props.label }),
    );
    root.mount(container, { label: 'first' });
    expect(container.textContent).toBe('first');
    expect(Array.isArray(root.hooks)).toBe(true);
    const paragraph = element('p');
    root.update({ label: 'second' });
    expect(received.map((props) => props.label)).toEqual(['first', 'second']);
    expect(container.textContent).toBe('second');
    expect(element('p')).toBe(paragraph);
    root.unmount();
  });

  it('[COMP-01] empty and multiple root results normalize without a wrapper element', () => {
    const root = new component.FunctionComponent<{ empty: boolean }>(({ empty }) =>
      empty ? null : [host('a'), false, ['b', 3]],
    );
    root.mount(container, { empty: true });
    expect(container.childNodes).toHaveLength(0);
    root.update({ empty: false });
    expect(container.textContent).toBe('ab3');
    expect(container.children).toHaveLength(1);
    root.unmount();
  });

  it('[STA-01 STA-02 STA-03 COMP-03] independent state slots update synchronously and preserve reusable DOM', () => {
    let setCount!: Setter<number>;
    let setLabel!: Setter<string>;
    const root = new component.FunctionComponent(() => {
      const [count, countSetter] = hooks.useState(0);
      const [label, labelSetter] = hooks.useState('a');
      setCount = countSetter;
      setLabel = labelSetter;
      return vdom.h('div', null, host(count), vdom.h('span', null, label));
    });
    root.mount(container, {});
    const div = element('div');
    const paragraph = element('p');
    const span = element('span');
    setCount(2);
    expect(container.textContent).toBe('2a');
    setLabel('b');
    expect(container.textContent).toBe('2b');
    expect(element('div')).toBe(div);
    expect(element('p')).toBe(paragraph);
    expect(element('span')).toBe(span);
    root.unmount();
  });

  it('[STA-01 STA-03] [임시 OPEN-07] lazy initialization runs once per mount and setters remain stable', () => {
    const initialize = vi.fn(() => 4);
    const setters: Setter<number>[] = [];
    const root = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(initialize);
      setters.push(setter);
      return host(value);
    });
    root.mount(container, {});
    const setter = setters[0]!;
    setter((previous) => previous + 2);
    setter((previous) => previous * 3);
    root.update();
    expect(container.textContent).toBe('18');
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(setters.every((entry) => entry === setter)).toBe(true);
    root.unmount();
    root.mount(container, {});
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('4');
    expect(setters.at(-1)).not.toBe(setter);
    root.unmount();
  });

  it('[STA-03] [임시 OPEN-07] Object.is skips NaN but distinguishes positive and negative zero', () => {
    let setter!: Setter<number>;
    const render = vi.fn(() => {
      const [value, setValue] = hooks.useState(Number.NaN);
      setter = setValue;
      return host(Object.is(value, -0) ? '-0' : String(value));
    });
    const root = new component.FunctionComponent(render);
    root.mount(container, {});
    setter(Number.NaN);
    expect(render).toHaveBeenCalledTimes(1);
    setter(0);
    expect(render).toHaveBeenCalledTimes(2);
    setter(-0);
    expect(container.textContent).toBe('-0');
    expect(render).toHaveBeenCalledTimes(3);
    setter(-0);
    expect(render).toHaveBeenCalledTimes(3);
    root.unmount();
  });

  it('[STA-03 EFF-04] [임시 OPEN-07 OPEN-08] old generation setters cannot update an unmounted or remounted root', () => {
    let setter!: Setter<number>;
    const render = vi.fn(() => {
      const [value, setValue] = hooks.useState(1);
      setter = setValue;
      return host(value);
    });
    const root = new component.FunctionComponent(render);
    root.mount(container, {});
    const oldSetter = setter;
    oldSetter(7);
    root.unmount();
    const oldUpdater = vi.fn((value: number) => value + 100);
    oldSetter(oldUpdater);
    expect(oldUpdater).not.toHaveBeenCalled();
    expect(container.childNodes).toHaveLength(0);
    root.mount(container, {});
    expect(setter).not.toBe(oldSetter);
    const before = render.mock.calls.length;
    oldSetter(oldUpdater);
    expect(oldUpdater).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(before);
    expect(container.textContent).toBe('1');
    setter((value) => value + 1);
    expect(container.textContent).toBe('2');
    root.unmount();
  });

  it('[COMP-01 COMP-03] [임시 OPEN-08 OPEN-09] duplicate mount and update after unmount are rejected', () => {
    const root = new component.FunctionComponent(() => host('mounted'));
    root.mount(container, {});
    const node = element('p');
    expect(() => root.mount(container, {})).toThrow();
    expect(element('p')).toBe(node);
    root.unmount();
    expect(() => root.update()).toThrow();
    expect(() => root.unmount()).not.toThrow();
  });
});

describe('Hook context and candidate rollback', () => {
  it.each(['state', 'effect', 'memo'] as const)(
    '[TECH-05] [임시 OPEN-15] %s outside render fails without leaving an active context',
    (kind) => {
      const invoke = (): unknown => {
        if (kind === 'state') return hooks.useState(0);
        if (kind === 'effect') return hooks.useEffect(() => undefined, []);
        return hooks.useMemo(() => 0, []);
      };
      expect(invoke).toThrow();
      const root = new component.FunctionComponent(() => {
        const [value] = hooks.useState(3);
        return host(value);
      });
      root.mount(container, {});
      expect(container.textContent).toBe('3');
      expect(invoke).toThrow();
      root.unmount();
    },
  );

  it.each(['state', 'effect', 'memo'] as const)(
    '[TECH-05 TECH-06] [임시 OPEN-15] child %s invocation fails and the parent may retry',
    (kind) => {
      const ChildComponent: Render<Props> = () => {
        if (kind === 'state') hooks.useState(0);
        if (kind === 'effect') hooks.useEffect(() => undefined, []);
        if (kind === 'memo') hooks.useMemo(() => 0, []);
        return host('child');
      };
      const root = new component.FunctionComponent<{ invalid: boolean }>(({ invalid }) => {
        const [value] = hooks.useState(5);
        return invalid ? vdom.h(ChildComponent, null) : host(value);
      });
      expect(() => root.mount(container, { invalid: true })).toThrow();
      expect(container.childNodes).toHaveLength(0);
      expect(() => hooks.useState(0)).toThrow();
      root.mount(container, { invalid: false });
      expect(container.textContent).toBe('5');
      root.unmount();
    },
  );

  it('[TECH-05 STA-01] [임시 OPEN-15] root hooks evaluated as h arguments retain root context', () => {
    const ChildComponent: Render<Props> = (props) => host(String(props.value));
    const root = new component.FunctionComponent(() =>
      vdom.h(ChildComponent, { value: hooks.useState(8)[0] }),
    );
    root.mount(container, {});
    expect(container.textContent).toBe('8');
    root.unmount();
  });

  it.each(['fewer', 'more', 'kind'] as const)(
    '[STA-02 MEMO-02 EFF-02] [임시 OPEN-09 OPEN-15] %s hook mismatch preserves committed state, memo, effects and props',
    (mismatch) => {
      let setter!: Setter<number>;
      let invalid = false;
      let lastMemo: object | undefined;
      const calculate = vi.fn((value: number) => ({ value }));
      const setup = vi.fn(() => undefined);
      const root = new component.FunctionComponent<{ label: string }>(({ label }) => {
        const [value, setValue] = hooks.useState(0);
        setter = setValue;
        if (invalid && mismatch === 'kind') {
          hooks.useState('wrong kind');
        } else {
          lastMemo = hooks.useMemo(() => calculate(value), [value]);
        }
        if (!(invalid && mismatch === 'fewer')) hooks.useEffect(setup, [value]);
        if (invalid && mismatch === 'more') hooks.useState('extra');
        return host(`${label}:${value}`);
      });
      root.mount(container, { label: 'good' });
      const memo = lastMemo;
      const node = element('p');
      invalid = true;
      expect(() => setter(1)).toThrow();
      expect(container.textContent).toBe('good:0');
      expect(element('p')).toBe(node);
      expect(setup).toHaveBeenCalledTimes(1);
      expect(() => hooks.useState(0)).toThrow();
      invalid = false;
      root.update();
      expect(lastMemo).toBe(memo);
      expect(container.textContent).toBe('good:0');
      setter((previous) => previous + 2);
      expect(container.textContent).toBe('good:2');
      root.unmount();
    },
  );

  it('[STA-03] [임시 OPEN-09 OPEN-15] render-time setter is rejected and retry uses the last successful state', () => {
    let setter!: Setter<number>;
    let invalid = false;
    const root = new component.FunctionComponent(() => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      if (invalid) setValue(9);
      return host(value);
    });
    root.mount(container, {});
    invalid = true;
    expect(() => setter(1)).toThrow();
    expect(container.textContent).toBe('0');
    invalid = false;
    setter((previous) => previous + 2);
    expect(container.textContent).toBe('2');
    root.unmount();
  });

  it('[COMP-03 STA-03 MEMO-02 EFF-02] [임시 OPEN-09] invalid VDOM rejects new props and releases context before retry', () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const root = new component.FunctionComponent<{ label: string; invalid: boolean }>((props) => {
      hooks.useState(1);
      hooks.useEffect(setup, [props.label]);
      return props.invalid
        ? vdom.h('div', null, vdom.h('p', { key: 'same' }), vdom.h('p', { key: 'same' }))
        : host(props.label);
    });
    root.mount(container, { label: 'good', invalid: false });
    const node = element('p');
    expect(() => root.update({ label: 'bad', invalid: true })).toThrow();
    expect(element('p')).toBe(node);
    expect(cleanup).not.toHaveBeenCalled();
    expect(setup).toHaveBeenCalledTimes(1);
    expect(() => hooks.useMemo(() => 1, [])).toThrow();
    root.update();
    expect(container.textContent).toBe('good');
    root.update({ label: 'retry', invalid: false });
    expect(container.textContent).toBe('retry');
    expect(setup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});

describe('Effect dependencies and lifecycle', () => {
  it('[EFF-01 EFF-02 EFF-03 EFF-04] [임시 OPEN-08 OPEN-11] effects see committed DOM; omitted deps run each time and [] runs only once', () => {
    const observed: string[] = [];
    const cleanup = vi.fn();
    const once = vi.fn(() => cleanup);
    const root = new component.FunctionComponent<{ value: number }>(({ value }) => {
      hooks.useEffect(() => { observed.push(container.textContent ?? ''); });
      hooks.useEffect(once, []);
      return host(value);
    });
    root.mount(container, { value: 0 });
    root.update({ value: 1 });
    root.update({ value: 1 });
    expect(observed).toEqual(['0', '1', '1']);
    expect(once).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('[EFF-02 EFF-03] [임시 OPEN-11] Object.is dependencies distinguish signed zero and compare object references', () => {
    const setup = vi.fn(() => undefined);
    const object = { value: 0 };
    const root = new component.FunctionComponent<{ dep: unknown }>(({ dep }) => {
      hooks.useEffect(setup, [dep]);
      return host('effect');
    });
    root.mount(container, { dep: Number.NaN });
    root.update({ dep: Number.NaN });
    expect(setup).toHaveBeenCalledTimes(1);
    root.update({ dep: 0 });
    root.update({ dep: -0 });
    expect(setup).toHaveBeenCalledTimes(3);
    root.update({ dep: object });
    object.value = 1;
    root.update({ dep: object });
    expect(setup).toHaveBeenCalledTimes(4);
    root.update({ dep: { value: 1 } });
    expect(setup).toHaveBeenCalledTimes(5);
    root.unmount();
  });

  it('[EFF-02] [임시 OPEN-11] dependency arrays are snapshotted instead of retained by reference', () => {
    const deps = [1];
    const observed: number[] = [];
    const root = new component.FunctionComponent(() => {
      const value = deps[0]!;
      hooks.useEffect(() => { observed.push(value); }, deps);
      return host(value);
    });
    root.mount(container, {});
    deps[0] = 2;
    root.update();
    expect(observed).toEqual([1, 2]);
    root.unmount();
  });

  it.each([
    { initial: undefined, next: [] },
    { initial: [], next: undefined },
    { initial: [1], next: [1, 2] },
    { initial: [1, 2], next: [1] },
  ])('[EFF-02] [임시 OPEN-11 OPEN-09] deps contract change $initial -> $next rolls back', ({ initial, next }) => {
    const setup = vi.fn(() => undefined);
    const root = new component.FunctionComponent<{ deps: readonly unknown[] | undefined; label: string }>(
      ({ deps, label }) => {
        hooks.useEffect(setup, deps);
        return host(label);
      },
    );
    root.mount(container, { deps: initial, label: 'good' });
    expect(() => root.update({ deps: next, label: 'bad' })).toThrow();
    expect(container.textContent).toBe('good');
    expect(setup).toHaveBeenCalledTimes(1);
    root.update();
    expect(container.textContent).toBe('good');
    expect(setup).toHaveBeenCalledTimes(initial === undefined ? 2 : 1);
    root.unmount();
  });

  it('[EFF-01 EFF-03 EFF-04] [임시 OPEN-08] returning no cleanup is valid on update and removal', () => {
    const setup = vi.fn(() => undefined);
    const root = new component.FunctionComponent<{ value: number }>(({ value }) => {
      hooks.useEffect(setup, [value]);
      return host(value);
    });
    root.mount(container, { value: 0 });
    expect(() => root.update({ value: 1 })).not.toThrow();
    expect(() => root.unmount()).not.toThrow();
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('[EFF-03 EFF-04] [임시 OPEN-08] cleanup precedes its new setup in slot order and removal cleans once', () => {
    const events: string[] = [];
    const root = new component.FunctionComponent<{ value: number }>(({ value }) => {
      for (const name of ['a', 'b']) {
        hooks.useEffect(() => {
          events.push(`setup:${name}:${value}:${container.textContent}`);
          return () => { events.push(`cleanup:${name}:${value}`); };
        }, [value]);
      }
      return host(value);
    });
    root.mount(container, { value: 0 });
    root.update({ value: 1 });
    root.unmount();
    root.unmount();
    expect(events).toEqual([
      'setup:a:0:0', 'setup:b:0:0',
      'cleanup:a:0', 'setup:a:1:1', 'cleanup:b:0', 'setup:b:1:1',
      'cleanup:a:1', 'cleanup:b:1',
    ]);
    expect(container.childNodes).toHaveLength(0);
  });

  it('[EFF-03] [임시 OPEN-09] cleanup exceptions report failure but do not stop later setup or roll back committed DOM', () => {
    const events: string[] = [];
    const root = new component.FunctionComponent<{ value: number }>(({ value }) => {
      hooks.useEffect(() => {
        events.push(`setup:a:${value}`);
        return () => {
          events.push(`cleanup:a:${value}`);
          if (value === 0) throw new Error('cleanup failure');
        };
      }, [value]);
      hooks.useEffect(() => {
        events.push(`setup:b:${value}`);
        return () => { events.push(`cleanup:b:${value}`); };
      }, [value]);
      return host(value);
    });
    root.mount(container, { value: 0 });
    expect(() => root.update({ value: 1 })).toThrow();
    expect(container.textContent).toBe('1');
    expect(events).toEqual([
      'setup:a:0', 'setup:b:0', 'cleanup:a:0', 'setup:a:1', 'cleanup:b:0', 'setup:b:1',
    ]);
    root.update({ value: 1 });
    expect(events).toHaveLength(6);
    root.unmount();
    expect(events.slice(-2)).toEqual(['cleanup:a:1', 'cleanup:b:1']);
  });

  it('[EFF-01 EFF-02] [임시 OPEN-09] failed setup does not stop later effects or retry until its deps change', () => {
    const later = vi.fn();
    const setup = vi.fn((value: number) => {
      if (value === 0) throw new Error('setup failure');
    });
    const root = new component.FunctionComponent<{ value: number }>(({ value }) => {
      hooks.useEffect(() => setup(value), [value]);
      hooks.useEffect(() => { later(value); }, [value]);
      return host(value);
    });
    expect(() => root.mount(container, { value: 0 })).toThrow();
    expect(container.textContent).toBe('0');
    expect(later).toHaveBeenCalledWith(0);
    root.update({ value: 0 });
    expect(setup).toHaveBeenCalledTimes(1);
    root.update({ value: 1 });
    expect(setup).toHaveBeenCalledTimes(2);
    root.unmount();
  });

  it('[EFF-04] [임시 OPEN-08 OPEN-09] setup-time unmount is rejected before changing ownership; returned cleanup is retained', () => {
    const cleanup = vi.fn();
    const later = vi.fn();
    let root!: Root<Record<string, never>>;
    const reentry = vi.fn(() => root.unmount());
    root = new component.FunctionComponent(() => {
      hooks.useEffect(() => {
        const node = element('p');
        expect(reentry).toThrow();
        expect(element('p')).toBe(node);
        return cleanup;
      }, []);
      hooks.useEffect(() => { later(); }, []);
      return host('alive');
    });
    root.mount(container, {});
    expect(reentry.mock.results[0]?.type).toBe('throw');
    expect(later).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('[EFF-03 EFF-04] [임시 OPEN-08 OPEN-09] deps-cleanup unmount is rejected and new setups continue', () => {
    const events: string[] = [];
    let root!: Root<{ value: number }>;
    const reentry = vi.fn(() => root.unmount());
    root = new component.FunctionComponent(({ value }: { value: number }) => {
      hooks.useEffect(() => {
        events.push(`setup:${value}`);
        return () => {
          events.push(`cleanup:${value}`);
          expect(reentry).toThrow();
        };
      }, [value]);
      hooks.useEffect(() => { events.push(`later:${value}`); }, [value]);
      return host(value);
    });
    root.mount(container, { value: 0 });
    root.update({ value: 1 });
    expect(reentry.mock.results[0]?.type).toBe('throw');
    expect(events).toEqual(['setup:0', 'later:0', 'cleanup:0', 'setup:1', 'later:1']);
    expect(container.textContent).toBe('1');
    root.unmount();
  });

  it('[EFF-04 STA-03] [임시 OPEN-08 OPEN-09] removal rejects reentry, ignores setters and continues cleanup after exceptions', () => {
    const events: string[] = [];
    const updater = vi.fn((previous: number) => previous + 1);
    let root!: Root<Record<string, never>>;
    const reentry = vi.fn(() => root.unmount());
    root = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(0);
      hooks.useEffect(() => () => {
        events.push('first');
        expect(reentry).toThrow();
        setter(updater);
        throw new Error('cleanup failure');
      }, []);
      hooks.useEffect(() => () => { events.push('second'); }, []);
      return host(value);
    });
    root.mount(container, {});
    expect(() => root.unmount()).toThrow();
    expect(reentry.mock.results[0]?.type).toBe('throw');
    expect(events).toEqual(['first', 'second']);
    expect(updater).not.toHaveBeenCalled();
    expect(container.childNodes).toHaveLength(0);
    expect(() => root.unmount()).not.toThrow();
    expect(events).toHaveLength(2);
  });

  it('[STA-03 EFF-01] [임시 OPEN-07 OPEN-09] effect setters queue until all current effects finish and receive latest successful state', () => {
    const events: string[] = [];
    const root = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(0);
      events.push(`render:${value}`);
      hooks.useEffect(() => {
        events.push(`first:${value}:${container.textContent}`);
        if (value === 0) {
          setter((previous) => previous + 1);
          setter((previous) => previous + 2);
          events.push(`queued:${container.textContent}`);
        }
      }, [value]);
      hooks.useEffect(() => { events.push(`second:${value}:${container.textContent}`); }, [value]);
      return host(value);
    });
    root.mount(container, {});
    expect(events).toEqual([
      'render:0', 'first:0:0', 'queued:0', 'second:0:0',
      'render:1', 'first:1:1', 'second:1:1',
      'render:3', 'first:3:3', 'second:3:3',
    ]);
    expect(container.textContent).toBe('3');
    root.unmount();
  });

  it('[STA-03 EFF-01] [임시 OPEN-09] an endless effect update chain is blocked after at most 50 consecutive updates', () => {
    const values: number[] = [];
    const root = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(0);
      values.push(value);
      hooks.useEffect(() => { setter((previous) => previous + 1); });
      return host(value);
    });
    expect(() => root.mount(container, {})).toThrow();
    // Initial render is not an update; the guard must not allow update #51 to commit.
    expect(values.length).toBeGreaterThanOrEqual(50);
    expect(values.length).toBeLessThanOrEqual(52);
    expect(Number(container.textContent)).toBeLessThanOrEqual(50);
    root.unmount();
  });
});

describe('Memo candidate semantics', () => {
  it('[MEMO-01 MEMO-02 MEMO-03] [임시 OPEN-11 OPEN-13] equal deps reuse the exact reference but A B A recalculates A', () => {
    const calculate = vi.fn((dep: string) => ({ dep }));
    let result: object | undefined;
    const root = new component.FunctionComponent<{ dep: string }>(({ dep }) => {
      result = hooks.useMemo(() => calculate(dep), [dep]);
      return host(dep);
    });
    root.mount(container, { dep: 'A' });
    const firstA = result;
    root.update({ dep: 'A' });
    expect(result).toBe(firstA);
    expect(calculate).toHaveBeenCalledTimes(1);
    root.update({ dep: 'B' });
    const firstB = result;
    root.update({ dep: 'A' });
    expect(result).not.toBe(firstA);
    expect(result).not.toBe(firstB);
    expect(calculate.mock.calls.map(([dep]) => dep)).toEqual(['A', 'B', 'A']);
    root.unmount();
  });

  it('[MEMO-02 MEMO-03] [임시 OPEN-11] dependencies use Object.is, retain inner object references and snapshot the outer array', () => {
    const object = { value: 0 };
    const deps: unknown[] = [Number.NaN, object];
    const calculate = vi.fn(() => ({}));
    const root = new component.FunctionComponent(() => {
      hooks.useMemo(calculate, deps);
      return host('memo');
    });
    root.mount(container, {});
    object.value = 1;
    root.update();
    expect(calculate).toHaveBeenCalledTimes(1);
    deps[0] = 0;
    root.update();
    deps[0] = -0;
    root.update();
    expect(calculate).toHaveBeenCalledTimes(3);
    deps[1] = { value: 1 };
    root.update();
    expect(calculate).toHaveBeenCalledTimes(4);
    root.unmount();
  });

  it('[MEMO-02 MEMO-03] [임시 OPEN-09 OPEN-11] changing memo dependency length rejects candidate and preserves the cache', () => {
    const calculate = vi.fn(() => ({}));
    let result: object | undefined;
    const root = new component.FunctionComponent<{ deps: readonly unknown[] }>(({ deps }) => {
      result = hooks.useMemo(calculate, deps);
      return host('memo');
    });
    root.mount(container, { deps: [1] });
    const committed = result;
    expect(() => root.update({ deps: [1, 2] })).toThrow();
    root.update();
    expect(result).toBe(committed);
    expect(calculate).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it('[STA-03 MEMO-02 EFF-02] [임시 OPEN-09 OPEN-13] render failure discards candidate state, memo and effects, then retries from committed cache', () => {
    let invalid = false;
    let setter!: Setter<number>;
    let result: object | undefined;
    const calculate = vi.fn((value: number) => ({ value }));
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const root = new component.FunctionComponent(() => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      result = hooks.useMemo(() => calculate(value), [value]);
      hooks.useEffect(setup, [value]);
      if (invalid) throw new Error('render failure after memo');
      return host(value);
    });
    root.mount(container, {});
    const committed = result;
    const node = element('p');
    invalid = true;
    expect(() => setter(1)).toThrow();
    const failedCandidate = result;
    expect(failedCandidate).not.toBe(committed);
    expect(element('p')).toBe(node);
    expect(container.textContent).toBe('0');
    expect(cleanup).not.toHaveBeenCalled();
    expect(setup).toHaveBeenCalledTimes(1);
    invalid = false;
    root.update();
    expect(result).toBe(committed);
    expect(calculate).toHaveBeenCalledTimes(2);
    setter((previous) => previous + 1);
    expect(container.textContent).toBe('1');
    expect(result).not.toBe(failedCandidate);
    expect(calculate).toHaveBeenCalledTimes(3);
    root.unmount();
  });
});

describe('keyed child boundaries and root lifetime', () => {
  it('[COMP-02 DIFF-01 PATCH-03] keyed child receives no reserved key and its original VNode remains unchanged', () => {
    const original = vdom.h('li', null, 'item');
    const before = structuredClone(original);
    const received: Props[] = [];
    const ChildComponent: Render<Props> = (props) => {
      received.push(props);
      return original;
    };
    const root = new component.FunctionComponent(() =>
      vdom.h('ul', null, vdom.h(ChildComponent, { key: 'external', label: 'item' })),
    );
    root.mount(container, {});
    expect(received).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(received[0], 'key')).toBe(false);
    expect(received[0]!.label).toBe('item');
    expect(element('li').getAttribute('data-key')).toBe('external');
    expect(original).toEqual(before);
    root.unmount();
  });

  it('[COMP-02 DIFF-01] same inner and outer keys are allowed without modifying the returned element', () => {
    const original = vdom.h('li', { key: 'same' }, 'item');
    const before = structuredClone(original);
    const ChildComponent: Render<Props> = () => original;
    const root = new component.FunctionComponent(() =>
      vdom.h('ul', null, vdom.h(ChildComponent, { key: 'same' })),
    );
    root.mount(container, {});
    expect(element('li').getAttribute('data-key')).toBe('same');
    expect(original).toEqual(before);
    root.unmount();
  });

  it.each(['empty', 'text', 'multiple', 'conflicting-key'] as const)(
    '[COMP-02 DIFF-01] [임시 OPEN-09] keyed child returning %s rejects before DOM changes and remains retryable',
    (kind) => {
      const ChildComponent: Render<Props> = () => {
        if (kind === 'empty') return null;
        if (kind === 'text') return 'text';
        if (kind === 'multiple') return [host('a'), host('b')];
        return vdom.h('p', { key: 'inner' }, 'conflict');
      };
      const root = new component.FunctionComponent<{ invalid: boolean }>(({ invalid }) =>
        invalid ? vdom.h(ChildComponent, { key: 'outer' }) : host('valid'),
      );
      root.mount(container, { invalid: false });
      const node = element('p');
      expect(() => root.update({ invalid: true })).toThrow();
      expect(element('p')).toBe(node);
      expect(container.textContent).toBe('valid');
      expect(() => hooks.useState(0)).toThrow();
      root.update();
      expect(container.textContent).toBe('valid');
      root.unmount();
    },
  );

  it('[COMP-02] unkeyed children may return empty, text or multiple nodes', () => {
    const Empty: Render<Props> = () => null;
    const Text: Render<Props> = () => 'text';
    const Multiple: Render<Props> = () => [host('a'), host('b')];
    const root = new component.FunctionComponent(() => [
      vdom.h(Empty, null), vdom.h(Text, null), vdom.h(Multiple, null),
    ]);
    root.mount(container, {});
    expect(container.textContent).toBe('textab');
    expect(container.children).toHaveLength(2);
    root.unmount();
  });

  it('[COMP-03 STA-02 EFF-02 PATCH-03] [임시 OPEN-11] keyed reorder and key replacement preserve root state and same-deps effect lifetime', () => {
    let setter!: Setter<number>;
    const setters: Setter<number>[] = [];
    const setup = vi.fn(() => cleanup);
    const cleanup = vi.fn();
    const ChildComponent: Render<Props> = (props) => vdom.h('li', null, String(props.label));
    const root = new component.FunctionComponent<{ order: readonly string[] }>(({ order }) => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      setters.push(setValue);
      hooks.useEffect(setup, []);
      return vdom.h('div', null, host(value), vdom.h('ul', null,
        ...order.map((key) => vdom.h(ChildComponent, { key, label: key })),
      ));
    });
    root.mount(container, { order: ['a', 'b', 'c'] });
    const originalSetter = setter;
    const oldNodes = Array.from(container.querySelectorAll('li'));
    setter(7);
    root.update({ order: ['c', 'a', 'b'] });
    const reordered = Array.from(container.querySelectorAll('li'));
    expectSameNodes(reordered, [oldNodes[2], oldNodes[0], oldNodes[1]]);
    root.update({ order: ['c', 'new', 'b'] });
    expect(element('p').textContent).toBe('7');
    expect(element('[data-key="new"]')).not.toBe(oldNodes[0]);
    expect(setters.every((entry) => entry === originalSetter)).toBe(true);
    originalSetter((value) => value + 1);
    expect(element('p').textContent).toBe('8');
    expect(setup).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('partial DOM failure recovery', () => {
  it('[PATCH-02 STA-03 MEMO-02 EFF-04] [임시 OPEN-08 OPEN-09] partial native write faults the root, cleans captured old nodes and discards candidates and queue', () => {
    let setter!: Setter<number>;
    let memo: object | undefined;
    const captured: Element[] = [];
    const cleaned: Element[] = [];
    const candidateSetup = vi.fn();
    const queuedUpdater = vi.fn((value: number) => value + 100);
    const vdomClick = vi.fn<(event: Event) => void>();
    const effectListener = vi.fn(() => { setter((previous) => previous + 1); });
    const calculate = vi.fn((value: number) => ({ value }));
    const root = new component.FunctionComponent(() => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      memo = hooks.useMemo(() => calculate(value), [value]);
      hooks.useEffect(() => {
        const node = element('p');
        captured.push(node);
        node.addEventListener('change', effectListener);
        return () => {
          cleaned.push(node);
          node.removeEventListener('change', effectListener);
        };
      }, []);
      hooks.useEffect(() => { candidateSetup(value); }, [value]);
      return vdom.h('p', { attrs: { title: String(value) }, events: { click: vdomClick } }, vdom.text(value));
    });
    root.mount(container, {});
    const oldNode = element('p');
    oldNode.dispatchEvent(new Event('click'));
    expect(vdomClick).toHaveBeenCalledTimes(1);
    expect(effectListener).not.toHaveBeenCalled();
    const oldSetter = setter;
    const committedMemo = memo;
    const nativeSetAttribute = Element.prototype.setAttribute;
    let injected = false;
    const writeSpy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
      this: Element, name: string, value: string,
    ): void {
      nativeSetAttribute.call(this, name, value);
      if (!injected && this === oldNode && name === 'title' && value === '1') {
        // A real native mutation has already happened: not a preparation-only failure.
        injected = true;
        oldSetter(queuedUpdater);
        throw new Error('injected after partial DOM write');
      }
    });
    try {
      expect(() => oldSetter(1)).toThrow();
      expect(injected).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
    expect(root.phase).toBe('faulted');
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toBe(oldNode);
    expect(captured).toHaveLength(1);
    expect(candidateSetup.mock.calls).toEqual([[0]]);
    expect(queuedUpdater).not.toHaveBeenCalled();
    expect(root.hooks.find((slot) => slot.kind === 'state')?.value).toBe(0);
    expect(root.hooks.find((slot) => slot.kind === 'memo')?.value).toBe(committedMemo);
    expect(container.textContent).toBe('0');
    expect(element('p').getAttribute('title')).toBe('0');
    oldSetter(queuedUpdater);
    const recoveredNode = element('p');
    for (const node of [oldNode, recoveredNode]) {
      node.dispatchEvent(new Event('click'));
      node.dispatchEvent(new Event('change'));
    }
    expect(vdomClick).toHaveBeenCalledTimes(1);
    expect(effectListener).not.toHaveBeenCalled();
    expect(queuedUpdater).not.toHaveBeenCalled();
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(() => root.update()).toThrow();
    expect(() => root.mount(container, {})).toThrow();
    root.unmount();
    expect(cleaned).toHaveLength(1);
    expect(container.childNodes).toHaveLength(0);
    root.mount(container, {});
    expect(setter).not.toBe(oldSetter);
    expect(container.textContent).toBe('0');
    expect(captured).toHaveLength(2);
    expect(captured[1]).not.toBe(oldNode);
    expect(memo).not.toBe(committedMemo);
    expect(candidateSetup.mock.calls).toEqual([[0], [0]]);
    element('p').dispatchEvent(new Event('click'));
    expect(vdomClick).toHaveBeenCalledTimes(2);
    oldSetter(queuedUpdater);
    expect(queuedUpdater).not.toHaveBeenCalled();
    setter(2);
    expect(container.textContent).toBe('2');
    root.unmount();
    expect(cleaned).toHaveLength(2);
    expect(cleaned[1]).toBe(captured[1]);
  });

  it('[PATCH-02 EFF-04] [임시 OPEN-08 OPEN-09] recovering cleanup 오류 뒤에도 나머지 자원을 한 번씩 정리하고 표시를 재구성한다', () => {
    let setter!: Setter<number>;
    const active = new Set<string>();
    const cleaned: string[] = [];
    const resources: { name: string; node: Element; listener: ReturnType<typeof vi.fn> }[] = [];
    const setups = vi.fn();
    const root = new component.FunctionComponent(() => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      for (const name of ['first', 'second']) {
        hooks.useEffect(() => {
          setups(name);
          const node = element('p');
          const listener = vi.fn();
          active.add(name);
          resources.push({ name, node, listener });
          node.addEventListener(`contract-${name}`, listener);
          return () => {
            // Release the resource actually owned by this cleanup BEFORE reporting failure.
            node.removeEventListener(`contract-${name}`, listener);
            active.delete(name);
            cleaned.push(name);
            if (name === 'first') throw new Error('first cleanup failed after release');
          };
        }, []);
      }
      return vdom.h('p', { attrs: { title: String(value) } }, vdom.text(value));
    });
    root.mount(container, {});
    const oldNode = element('p');
    expect(active.size).toBe(2);
    resources.forEach(({ name, node, listener }) => {
      node.dispatchEvent(new Event(`contract-${name}`));
      expect(listener).toHaveBeenCalledTimes(1);
    });
    const native = Element.prototype.setAttribute;
    let injected = false;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
      this: Element, name: string, value: string,
    ): void {
      native.call(this, name, value);
      if (!injected && this === oldNode && name === 'title' && value === '1') {
        injected = true;
        throw new Error('partial DOM write failed');
      }
    });
    try {
      expect(() => setter(1)).toThrow();
      expect(injected).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(cleaned).toEqual(['first', 'second']);
    expect(active.size).toBe(0);
    expect(setups.mock.calls).toEqual([['first'], ['second']]);
    expect(root.phase).toBe('faulted');
    expect(container.textContent).toBe('0');
    expect(element('p').getAttribute('title')).toBe('0');
    resources.forEach(({ name, node, listener }) => {
      node.dispatchEvent(new Event(`contract-${name}`));
      expect(listener).toHaveBeenCalledTimes(1);
    });
    expect(() => root.update()).toThrow();
    // A cleanup already attempted during recovering must not run again during unmount.
    expect(() => root.unmount()).not.toThrow();
    expect(cleaned).toEqual(['first', 'second']);
    expect(container.childNodes).toHaveLength(0);
  });
});
