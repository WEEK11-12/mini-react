import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectModule } from '../support/project';

type Setter<T> = (next: T | ((previous: T) => T)) => void;
type Child = unknown;
interface Root<P> {
  readonly phase: string;
  mount(container: Element, props: P): void;
  update(props?: P): void;
  unmount(): void;
}
interface ComponentModule { FunctionComponent: new <P>(render: (props: P) => Child) => Root<P> }
interface VdomModule { h(type: string, props: { attrs?: Record<string, string> } | null, ...children: Child[]): Child }
interface HooksModule {
  useState<T>(initial: T | (() => T)): [T, Setter<T>];
  useEffect(setup: () => void | (() => void), deps?: readonly unknown[]): void;
  useMemo<T>(calculate: () => T, deps: readonly unknown[]): T;
}
let component: ComponentModule;
let vdom: VdomModule;
let hooks: HooksModule;
let container: HTMLDivElement;

beforeEach(async () => {
  [component, vdom, hooks] = await Promise.all([
    projectModule<ComponentModule>('core/component.ts'),
    projectModule<VdomModule>('core/vdom.ts'),
    projectModule<HooksModule>('core/hooks.ts'),
  ]);
  container = document.createElement('div');
  document.body.append(container);
});

describe('명시적 오용과 오류 수명 경계', () => {
  it.each([['숫자', (): number => 1], ['Promise', (): Promise<void> => Promise.resolve()]] as const)(
    '[EFF-01][임시 OPEN-09] setup의 잘못된 %s 반환은 오류를 보고하고 다른 Effect를 계속한다',
    (_name, invalidSetup) => {
      const later = vi.fn();
      const root = new component.FunctionComponent(() => {
        // Deliberately cross the typed API boundary to exercise JavaScript runtime misuse.
        hooks.useEffect(invalidSetup as unknown as () => void, []);
        hooks.useEffect(() => { later(); }, []);
        return vdom.h('p', null, 'committed');
      });
      expect(() => root.mount(container, {})).toThrow();
      expect(container.textContent).toBe('committed');
      expect(later).toHaveBeenCalledTimes(1);
      expect(() => root.unmount()).not.toThrow();
    },
  );

  it('[MEMO-01][임시 OPEN-11·09] Memo deps 생략은 최초 렌더 오류이며 다른 유효 mount를 막지 않는다', () => {
    const withoutDeps = hooks.useMemo as unknown as (calculate: () => number) => number;
    const invalid = new component.FunctionComponent(() => vdom.h('p', null, withoutDeps(() => 1)));
    expect(() => invalid.mount(container, {})).toThrow();
    expect(container.childNodes).toHaveLength(0);
    const valid = new component.FunctionComponent(() => vdom.h('p', null, hooks.useMemo(() => 2, [])));
    valid.mount(container, {});
    expect(container.textContent).toBe('2');
    valid.unmount();
  });

  it('[STA-01, STA-03][임시 OPEN-07] 함수를 반환하는 초기화·updater로 함수 자체를 State에 보존한다', () => {
    const first = vi.fn(() => 'first');
    const second = vi.fn(() => 'second');
    let observed!: () => string;
    let setter!: Setter<() => string>;
    const root = new component.FunctionComponent(() => {
      [observed, setter] = hooks.useState<() => string>(() => first);
      return vdom.h('p', null, 'function state');
    });
    root.mount(container, {});
    expect(observed).toBe(first);
    expect(first).not.toHaveBeenCalled();
    setter(() => second);
    expect(observed).toBe(second);
    expect(second).not.toHaveBeenCalled();
    root.unmount();
  });

  it('[STA-02, TECH-04] 서로 다른 두 루트는 Hook 슬롯과 setter 소유권을 공유하지 않는다', () => {
    const other = document.createElement('div');
    document.body.append(other);
    let setA!: Setter<number>;
    let setB!: Setter<number>;
    const a = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(1);
      setA = setter;
      return vdom.h('p', null, value);
    });
    const b = new component.FunctionComponent(() => {
      const [value, setter] = hooks.useState(10);
      setB = setter;
      return vdom.h('p', null, value);
    });
    a.mount(container, {});
    b.mount(other, {});
    setA(2);
    expect(container.textContent).toBe('2');
    expect(other.textContent).toBe('10');
    setB(20);
    expect(container.textContent).toBe('2');
    expect(other.textContent).toBe('20');
    a.unmount();
    setB(30);
    expect(other.textContent).toBe('30');
    b.unmount();
  });

  it('[EFF-04, COMP-03][임시 OPEN-08·09] 렌더 중 제거는 DOM·슬롯을 변경하기 전에 거부한다', () => {
    const cleanup = vi.fn();
    let root!: Root<{ attempt: boolean }>;
    root = new component.FunctionComponent(({ attempt }: { attempt: boolean }) => {
      hooks.useState(1);
      hooks.useEffect(() => cleanup, []);
      if (attempt) root.unmount();
      return vdom.h('p', null, 'last success');
    });
    root.mount(container, { attempt: false });
    const previous = container.firstChild;
    expect(() => root.update({ attempt: true })).toThrow();
    expect(container.firstChild).toBe(previous);
    expect(cleanup).not.toHaveBeenCalled();
    root.update();
    expect(container.textContent).toBe('last success');
    root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('[PATCH-02, EFF-04][임시 OPEN-08·09] 복구 생성도 실패하면 cleanup을 중복하지 않고 faulted에서 명시적 제거를 기다린다', () => {
    let setter!: Setter<number>;
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const root = new component.FunctionComponent(() => {
      const [value, setValue] = hooks.useState(0);
      setter = setValue;
      hooks.useEffect(setup, []);
      return vdom.h('p', { attrs: { title: String(value) } }, value);
    });
    root.mount(container, {});
    const oldNode = container.firstElementChild;
    const native = Element.prototype.setAttribute;
    let partialFailure = false;
    let recoveryFailure = false;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name, value) {
      native.call(this, name, value);
      if (this === oldNode && name === 'title' && value === '1') {
        partialFailure = true;
        throw new Error('partial application failed');
      }
      if (partialFailure && this !== oldNode && name === 'title' && value === '0') {
        recoveryFailure = true;
        throw new Error('display reconstruction failed');
      }
    });
    try {
      expect(() => setter(1)).toThrow();
      expect(partialFailure).toBe(true);
      expect(recoveryFailure).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(root.phase).toBe('faulted');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(() => root.update()).toThrow();
    const ignored = vi.fn((value: number) => value + 1);
    setter(ignored);
    expect(ignored).not.toHaveBeenCalled();
    root.unmount();
    expect(container.childNodes).toHaveLength(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    root.mount(container, {});
    expect(setup).toHaveBeenCalledTimes(2);
    root.unmount();
  });
});
