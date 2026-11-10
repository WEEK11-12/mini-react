import { FunctionComponent } from '../../src/core/component';
import { useEffect, useState, type Setter } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';
import { errorMessages } from './stage-seven-review-cases';

export function runErrorBudget(trigger: 'mount' | 'props' | 'setter', request: 'state' | 'props', limit: number) {
  const host = document.createElement('div');
  document.body.append(host);
  let armed = trigger === 'mount';
  let setter!: Setter<number>;
  const values: number[] = [];
  const root = new FunctionComponent(({ step }: { step: number }) => {
    const [value, set] = useState(0);
    setter = set;
    const index = Math.max(step, value);
    if (armed) values.push(index);
    useEffect(() => {
      if (!armed) return;
      if (index < limit) {
        if (request === 'state') setter(index + 1);
        else root.update({ step: index + 1 });
      }
      throw new Error(`effect:${index}`);
    }, [index]);
    return h('p', null, index);
  });
  let errors: string[] = [];
  try {
    if (trigger === 'mount') root.mount(host, { step: 0 });
    else {
      root.mount(host, { step: 0 });
      armed = true;
      if (trigger === 'setter') setter(1);
      else root.update({ step: 1 });
    }
  } catch (error) { errors = errorMessages(error); }
  const result = {
    text: host.textContent, phase: root.phase,
    updates: values.length - (trigger === 'mount' ? 1 : 0),
    effectFailures: errors.filter(value => /^effect:\d+$/.test(value)).length,
    limited: errors.includes('Too many consecutive updates'),
    retryText: '',
  };
  armed = false;
  root.update({ step: 99 });
  result.retryText = host.textContent ?? '';
  root.unmount();
  host.remove();
  return result;
}

export function runFatalAfterEffect(failure: 'updater' | 'render' | 'patch') {
  const host = document.createElement('div');
  document.body.append(host);
  let setter!: Setter<number>;
  let armed = false;
  let tailCalls = 0;
  const setups: number[] = [];
  const cleaned: number[] = [];
  const root = new FunctionComponent(() => {
    const [value, set] = useState(0);
    setter = set;
    useEffect(() => {
      setups.push(value);
      if (armed && value === 1) {
        setter(previous => {
          if (failure === 'updater') throw new Error('fatal:updater');
          return previous + 1;
        });
        setter(previous => { tailCalls += 1; return previous + 100; });
        throw new Error('effect:original');
      }
      return () => { cleaned.push(value); };
    }, [value]);
    if (armed && failure === 'render' && value === 2) throw new Error('fatal:render');
    return h('p', { attrs: { title: String(value) } }, value);
  });
  root.mount(host, {});
  const old = host.firstElementChild;
  const native = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    native.call(this, name, value);
    if (armed && failure === 'patch' && this === old && name === 'title' && value === '2') throw new Error('fatal:patch');
  };
  let errors: string[] = [];
  armed = true;
  try { setter(1); } catch (error) { errors = errorMessages(error); }
  finally { Element.prototype.setAttribute = native; }
  const result = { phase: root.phase, text: host.textContent, state: root.hooks[0].value, tailCalls, setups: setups.slice(), cleaned: cleaned.slice(), errors, retryText: '' };
  armed = false;
  if (root.phase === 'faulted') {
    root.unmount();
    root.mount(host, {});
  }
  setter(5);
  result.retryText = host.textContent ?? '';
  root.unmount();
  host.remove();
  return result;
}

export function runDepsBoundary(kind: 'holes' | 'snapshot' | 'object-is' | 'shape-rollback') {
  const host = document.createElement('div');
  document.body.append(host);
  const setups: string[] = [];
  const cleanups: string[] = [];
  const format = (deps: readonly unknown[]) => Array.from(deps, value => Number.isNaN(value) ? 'NaN' : Object.is(value, -0) ? '-0' : String(value)).join('|');
  const root = new FunctionComponent(({ deps }: { deps: readonly unknown[] }) => {
    const label = format(deps);
    useEffect(() => {
      setups.push(label);
      return () => { cleanups.push(label); };
    }, deps);
    return h('p', null, label);
  });
  let rejected = false;
  if (kind === 'holes') {
    root.mount(host, { deps: new Array<unknown>(2) });
    root.update({ deps: [undefined, undefined] });
    const deps: unknown[] = [undefined, 'x'];
    root.update({ deps });
    delete deps[1];
    root.update({ deps });
  } else if (kind === 'snapshot') {
    const deps: unknown[] = [1, 2];
    root.mount(host, { deps });
    delete deps[0];
    root.update({ deps });
    deps[1] = 3;
    root.update({ deps });
  } else if (kind === 'object-is') {
    const object = {};
    root.mount(host, { deps: [Number.NaN, 0, object] });
    root.update({ deps: [Number.NaN, 0, object] });
    root.update({ deps: [Number.NaN, -0, object] });
    root.update({ deps: [Number.NaN, -0, {}] });
  } else {
    root.mount(host, { deps: [1, 2] });
    try { root.update({ deps: new Array<unknown>(1) }); } catch { rejected = true; }
    root.update();
    root.update({ deps: [1, 3] });
  }
  const result = { setups: setups.slice(), cleanups: cleanups.slice(), text: host.textContent, rejected, finalCleanups: [] as string[] };
  root.unmount();
  result.finalCleanups = cleanups.slice();
  host.remove();
  return result;
}
