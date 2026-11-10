import { FunctionComponent } from '../../src/core/component';
import { useState, type Setter } from '../../src/core/hooks';
import { h, type Child, type Props } from '../../src/core/vdom';

export function runQueueCase(): Record<string, unknown> {
  const host = document.createElement('div');
  const renders: string[] = [];
  const during: unknown[] = [];
  const updaterInputs: number[] = [];
  let set!: Setter<number>;
  const root = new FunctionComponent(({ label }: { label: string }) => {
    const [value, setter] = useState(0);
    set = setter;
    renders.push(`${label}:${value}`);
    return h('p', { attrs: { title: label } }, `${label}:${value}`);
  });
  root.mount(host, { label: 'A' });
  const paragraph = host.firstElementChild!;
  const native = paragraph.setAttribute.bind(paragraph);
  let injected = false;
  paragraph.setAttribute = (name, value) => {
    native(name, value);
    if (!injected && name === 'title' && value === 'B') {
      injected = true;
      during.push(root.phase, root.hooks[0].value, host.textContent);
      set(previous => { updaterInputs.push(previous); return previous + 1; });
      root.update({ label: 'C' });
      set(previous => { updaterInputs.push(previous); return previous + 2; });
      root.update();
      during.push(renders.length);
    }
  };
  root.update({ label: 'B' });
  const result = { renders, during, updaterInputs, text: host.textContent, state: root.hooks[0].value, phase: root.phase, sameDOM: host.firstElementChild === paragraph };
  root.unmount();
  return result;
}

export function runLimitCase(kind: 'state' | 'props', limit: number): Record<string, unknown> {
  const host = document.createElement('div');
  let set!: Setter<number>;
  let commits = 0;
  let caught: string | null = null;
  const renders: number[] = [];
  const root = new FunctionComponent(({ step }: { step: number }) => {
    const [value, setter] = useState(0);
    set = setter;
    const current = kind === 'state' ? value : step;
    renders.push(current);
    return h('p', { attrs: { title: String(current) } }, current);
  });
  root.mount(host, { step: 0 });
  const paragraph = host.firstElementChild!;
  const native = paragraph.setAttribute.bind(paragraph);
  paragraph.setAttribute = (name, value) => {
    native(name, value);
    if (name === 'title') {
      commits += 1;
      const next = Number(value) + 1;
      if (next <= limit) {
        if (kind === 'state') set(next);
        else root.update({ step: next });
      }
    }
  };
  try {
    if (kind === 'state') set(1);
    else root.update({ step: 1 });
  } catch (error) { caught = (error as Error).message; }
  const text = host.textContent;
  const phase = root.phase;
  const updateRenders = renders.length - 1;
  const state = root.hooks[0].value;
  paragraph.setAttribute = native;
  if (kind === 'state') set(99);
  else root.update({ step: 99 });
  const result = { kind, limit, commits, caught, text, phase, updateRenders, state, retryText: host.textContent };
  root.unmount();
  return result;
}

export function runMountQueueCase(): Record<string, unknown> {
  const host = document.createElement('div');
  let set!: Setter<number>;
  const renders: number[] = [];
  const root = new FunctionComponent(() => {
    const [value, setter] = useState(0);
    set = setter;
    renders.push(value);
    return h('p', null, value);
  });
  const append = host.appendChild.bind(host);
  let phase = '';
  host.appendChild = <T extends Node>(node: T): T => {
    const result = append(node);
    phase = root.phase;
    set(previous => previous + 2);
    set(previous => previous * 3);
    return result;
  };
  root.mount(host, {});
  const result = { phaseDuringAppend: phase, renders, text: host.textContent, state: root.hooks[0].value };
  root.unmount();
  return result;
}

export function runLifetimeCase(): Record<string, unknown> {
  const host = document.createElement('div');
  let set!: Setter<number>;
  let invalid = false;
  let initializes = 0;
  const setters: Setter<number>[] = [];
  const root = new FunctionComponent(() => {
    const [value, setter] = useState(() => { initializes += 1; return 3; });
    set = setter;
    setters.push(setter);
    if (invalid) throw new Error('render failure');
    return h('p', { attrs: { title: String(value) } }, value);
  });
  root.mount(host, {});
  const original = set;
  const paragraph = host.firstElementChild!;
  invalid = true;
  let failed = false;
  try { set(7); } catch { failed = true; }
  const failureState = root.hooks[0].value;
  invalid = false;
  set(previous => previous + 1);
  root.update();
  const stable = setters.every(setter => setter === original);
  const sameDOM = host.firstElementChild === paragraph;
  root.unmount();
  let staleUpdaterCalls = 0;
  const staleUpdater = (previous: number): number => { staleUpdaterCalls += 1; return previous + 100; };
  original(staleUpdater);
  root.mount(host, {});
  original(staleUpdater);
  const result = { failed, failureState, stable, sameDOM, initializes, staleUpdaterCalls, freshSetter: set !== original, text: host.textContent };
  root.unmount();
  return result;
}

export function runChildCase(): Record<string, unknown> {
  const host = document.createElement('div');
  let rejected = false;
  const ChildComponent = (): Child => { useState(99); return null; };
  const Pure = (props: Props): Child => h('span', null, String(props.value));
  const root = new FunctionComponent(() => {
    const [value] = useState(1);
    try { h(() => h(ChildComponent, null), null); } catch { rejected = true; }
    const [other] = useState(2);
    return [h('p', null, value + other), h(Pure, { value: useState(4)[0] })];
  });
  root.mount(host, {});
  root.update();
  let outsideRejected = false;
  try { useState(0); } catch { outsideRejected = true; }
  const result = { rejected, outsideRejected, slots: root.hooks.length, text: host.textContent };
  root.unmount();
  return result;
}

export function runFaultCase(): Record<string, unknown> {
  const host = document.createElement('div');
  let set!: Setter<number>;
  let ignoredCalls = 0;
  let clicks = 0;
  const ignored = (previous: number): number => { ignoredCalls += 1; return previous + 100; };
  const root = new FunctionComponent(() => {
    const [value, setter] = useState(0);
    set = setter;
    return h('button', { attrs: { title: String(value) }, events: { click: () => { clicks += 1; setter(previous => previous + 1); } } }, value);
  });
  root.mount(host, {});
  const old = set;
  const paragraph = host.firstElementChild!;
  const native = paragraph.setAttribute.bind(paragraph);
  paragraph.setAttribute = (name, value) => {
    native(name, value);
    if (name === 'title' && value === '1') { set(ignored); root.update(); throw new Error('partial write'); }
  };
  const replace = host.replaceChildren.bind(host);
  const recoveryPhases: string[] = [];
  host.replaceChildren = (...nodes: (Node | string)[]) => {
    recoveryPhases.push(root.phase);
    set(ignored);
    return replace(...nodes);
  };
  let failed = false;
  try { set(1); } catch { failed = true; }
  const phase = root.phase;
  const text = host.textContent;
  const state = root.hooks[0].value;
  old(ignored);
  paragraph.dispatchEvent(new Event('click'));
  host.firstElementChild!.dispatchEvent(new Event('click'));
  let updateRejected = false;
  try { root.update(); } catch { updateRejected = true; }
  root.unmount();
  root.mount(host, {});
  old(ignored);
  const result = { failed, phase, text, state, ignoredCalls, clicks, updateRejected, recoveryPhases: recoveryPhases.slice(), freshSetter: set !== old, freshText: host.textContent };
  root.unmount();
  return result;
}
