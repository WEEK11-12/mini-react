import { FunctionComponent } from '../../src/core/component';
import { useState, type Setter } from '../../src/core/hooks';
import { h } from '../../src/core/vdom';

export function runMountBudgetCase(kind: 'state' | 'props', limit: number): Record<string, unknown> {
  const host = document.createElement('div');
  const renders: number[] = [];
  let set!: Setter<number>;
  let caught: string | null = null;
  let updateCommits = 0;
  let initialPhase = '';
  const root = new FunctionComponent(({ step }: { step: number }) => {
    const [value, setter] = useState(0);
    set = setter;
    const current = kind === 'state' ? value : step;
    renders.push(current);
    return h('p', { attrs: { title: String(current) } }, current);
  });
  function request(value: number): void {
    if (kind === 'state') set(value);
    else root.update({ step: value });
  }
  const append = host.appendChild.bind(host);
  let paragraph!: Element;
  let nativeSetAttribute!: (name: string, value: string) => void;
  host.appendChild = <T extends Node>(node: T): T => {
    const result = append(node);
    initialPhase = root.phase;
    paragraph = host.firstElementChild!;
    nativeSetAttribute = paragraph.setAttribute.bind(paragraph);
    paragraph.setAttribute = (name, value) => {
      nativeSetAttribute(name, value);
      if (name === 'title') {
        updateCommits += 1;
        const next = Number(value) + 1;
        if (next <= limit) request(next);
      }
    };
    request(1);
    return result;
  };
  try { root.mount(host, { step: 0 }); }
  catch (error) { caught = (error as Error).message; }
  const phase = root.phase;
  const text = host.textContent;
  const updateRenders = renders.length - 1;
  const state = root.hooks[0].value;
  paragraph.setAttribute = nativeSetAttribute;
  request(99);
  const result = { kind, limit, initialPhase, caught, phase, text, updateRenders, updateCommits, state, retryText: host.textContent };
  root.unmount();
  return result;
}
