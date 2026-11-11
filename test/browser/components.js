import { FunctionComponent, useState, useMemo, useEffect, renderChild } from '../../src/component.js';
import { element as e, text as t } from '../fixtures.js';

export const tests = [];
const test = (name, run) => tests.push({ name: `C ${name}`, run });
const assert = (value, message = '기대 조건 불일치') => { if (!value) throw new Error(message); };
const equal = (actual, expected) => assert(Object.is(actual, expected), `expected ${expected}, got ${actual}`);
const throws = (run, code) => { let caught; try { run(); } catch (error) { caught = error; } assert(caught, '오류가 발생해야 함'); if (code) equal(caught.code, code); };
const view = value => e('p', [t(String(value))]);
async function fixture(run) {
  const host = document.createElement('div'); document.body.append(host);
  const instances = [];
  const create = (fn, props, options) => { const instance = new FunctionComponent(fn, host, props, options); instances.push(instance); return instance; };
  try { await run(host, create); }
  finally { for (const instance of instances) if (instance.mounted) { try { instance.unmount(); } catch {} } host.remove(); }
}

test('01 mount/update와 props 자식은 기존 DOM을 재사용', () => fixture((host, create) => {
  let set;
  const app = create(() => { const [n, setter] = useState(1); set = setter; return renderChild(({ count }) => view(count), { count: n }); });
  app.mount(); const root = host.firstChild; set(2);
  equal(host.textContent, '2'); equal(host.firstChild, root); equal(app.hooks[0].value, 2);
}));
test('02 초기화 함수는 한 번 실행하고 setter 참조는 유지', () => fixture((host, create) => {
  let count = 0, set, previous;
  const app = create(() => { const [n, setter] = useState(() => { count++; return 0; }); previous ??= setter; set = setter; equal(setter, previous); return view(n); });
  app.mount(); set(1); app.update(); equal(count, 1);
}));
test('03 함수형 갱신 두 번은 직전 상태를 누적', () => fixture((host, create) => {
  let set, renders = 0; const app = create(() => { renders++; const [n, setter] = useState(0); set = setter; return view(n); });
  app.mount(); set(n => n + 1); set(n => n + 1); equal(host.textContent, '2'); equal(renders, 3);
}));
test('04 Object.is 같은 State는 실행 생략하고 NaN도 동일', () => fixture((host, create) => {
  let set, renders = 0; const app = create(() => { renders++; const [n, setter] = useState(NaN); set = setter; return view(n); });
  app.mount(); set(NaN); equal(renders, 1); set(0); set(-0); equal(renders, 3);
}));
test('05 false와 빈 문자열도 초기 State로 보존', () => fixture((host, create) => {
  const app = create(() => { const [a] = useState(false), [b] = useState(''); equal(a, false); equal(b, ''); return view('ok'); }); app.mount(); app.update();
}));
test('06 useMemo는 같은 의존성에서 결과 재사용', () => fixture((host, create) => {
  let set, calls = 0; const app = create(() => { const [n, setter] = useState(0); set = setter; const result = useMemo(() => { calls++; return { total: n * 2 }; }, [n]); return view(result.total); });
  app.mount(); const cached = app.hooks[1].value; app.update(); equal(app.hooks[1].value, cached); equal(calls, 1); set(1); equal(calls, 2);
}));
test('07 생략 deps는 매번, 빈 deps는 한 번 계산', () => fixture((host, create) => {
  let every = 0, once = 0; const app = create(() => { useMemo(() => every++); useMemo(() => once++, []); return view('ok'); }); app.mount(); app.update(); equal(every, 2); equal(once, 1);
}));
test('08 의존성 배열 복사와 길이 변경을 비교', () => fixture((host, create) => {
  let calls = 0, deps = [1]; const app = create(() => { useMemo(() => calls++, deps); return view('ok'); }); app.mount(); deps[0] = 2; app.update(); deps = [2, 3]; app.update(); equal(calls, 3);
}));
test('09 Effect는 DOM 반영 후 실행하고 cleanup은 재실행 전에 처리', () => fixture((host, create) => {
  let set; const log = []; const app = create(() => { const [n, setter] = useState(0); set = setter; useEffect(() => { log.push(`effect:${host.textContent}`); return () => log.push(`cleanup:${n}`); }, [n]); return view(n); });
  app.mount(); app.update(); set(1); app.unmount(); equal(log.join(','), 'effect:0,cleanup:0,effect:1,cleanup:1');
}));
test('10 Effect deps 생략과 빈 배열의 실행 횟수', () => fixture((host, create) => {
  let every = 0, once = 0; const app = create(() => { useEffect(() => { every++; }); useEffect(() => { once++; }, []); return view('ok'); }); app.mount(); app.update(); equal(every, 2); equal(once, 1);
}));
test('11 Hook은 루트 실행 문맥 밖에서 오류', () => { throws(() => useState(0), 'ERR_HOOK_CONTEXT'); throws(() => useMemo(() => 1), 'ERR_HOOK_CONTEXT'); throws(() => useEffect(() => {}), 'ERR_HOOK_CONTEXT'); });
test('12 renderChild 안 Hook은 오류이며 mount DOM을 남기지 않음', () => fixture((host, create) => {
  const app = create(() => renderChild(() => { useState(0); return view(0); })); throws(() => app.mount(), 'ERR_HOOK_CONTEXT'); equal(host.childNodes.length, 0);
}));
test('13 Hook 종류 변경은 기존 화면과 State 보존', () => fixture((host, create) => {
  let invalid = false; const app = create(() => { if (invalid) useMemo(() => 1, []); else useState(0); return view('before'); }); app.mount(); const root = app.root; invalid = true; throws(() => app.update(), 'ERR_HOOK_ORDER'); equal(app.root, root); equal(app.hooks[0].kind, 'state');
}));
for (const more of [false, true]) test(`14 Hook 개수 ${more ? '증가' : '감소'} 오류`, () => fixture((host, create) => {
  let changed = false; const app = create(() => { useState(0); if (changed === more) useState(1); return view('before'); }); app.mount(); changed = true; throws(() => app.update(), 'ERR_HOOK_ORDER'); equal(host.textContent, 'before');
}));
test('15 렌더 중 setter는 오류이며 이전 화면 유지', () => fixture((host, create) => {
  let set, invalid = false; const app = create(() => { const [n, setter] = useState(0); set = setter; if (invalid) setter(5); return view(n); }); app.mount(); invalid = true; throws(() => set(1), 'ERR_RENDER_UPDATE'); equal(app.hooks[0].value, 0); equal(host.textContent, '0');
}));
test('16 렌더/Memo/VNode 실패는 State와 Memo를 커밋하지 않음', () => fixture((host, create) => {
  let set, mode; const app = create(() => { const [n, setter] = useState(0); set = setter; useMemo(() => { if (mode === 'memo') throw Error('memo'); return n; }, [n]); if (mode === 'render') throw Error('render'); return mode === 'vnode' ? null : view(n); });
  app.mount(); const root = app.root; for (mode of ['memo', 'render', 'vnode']) { throws(() => set(1)); equal(app.hooks[0].value, 0); equal(app.hooks[1].value, 0); equal(app.root, root); } mode = null; set(2); equal(host.textContent, '2');
}));
test('17 deps와 callback 인자의 잘못된 타입 거부', () => fixture((host, create) => {
  for (const hook of [() => useMemo(() => 1, null), () => useEffect(() => {}, 1), () => useMemo(1, []), () => useEffect(1, [])]) { const app = create(() => { hook(); return view('bad'); }); throws(() => app.mount(), 'ERR_INVALID_HOOK'); } equal(host.childNodes.length, 0);
}));
test('18 Effect 오류 후에도 다른 Effect 실행, DOM은 커밋 유지', () => fixture((host, create) => {
  let set, calls = 0; const app = create(() => { const [n, setter] = useState(0); set = setter; useEffect(() => { if (n) throw Error('effect'); }, [n]); useEffect(() => { calls++; }, [n]); return view(n); }); app.mount(); throws(() => set(1)); equal(host.textContent, '1'); equal(app.hooks[0].value, 1); equal(calls, 2);
}));
test('19 cleanup 오류에도 새 Effect 및 나머지 정리 시도', () => fixture((host, create) => {
  let set; const log = []; const app = create(() => { const [n, setter] = useState(0); set = setter; useEffect(() => { log.push(`run${n}`); return () => { log.push(`clean${n}`); throw Error('cleanup'); }; }, [n]); useEffect(() => () => log.push('other'), []); return view(n); }); app.mount(); throws(() => set(1)); equal(log.join(','), 'run0,clean0,run1'); throws(() => app.unmount()); assert(log.includes('other')); equal(host.childNodes.length, 0); assert(!app.mounted);
}));
test('20 Effect setter는 microtask에서 실행', () => fixture(async (host, create) => {
  const app = create(() => { const [n, set] = useState(0); useEffect(() => { if (!n) set(1); }, [n]); return view(n); }); app.mount(); equal(host.textContent, '0'); await Promise.resolve(); equal(host.textContent, '1');
}));
test('21 unmount는 예약 갱신 취소하고 이전 setter를 거부', () => fixture(async (host, create) => {
  let set; const app = create(() => { const [n, setter] = useState(0); set = setter; useEffect(() => { setter(1); }, []); return view(n); }); app.mount(); app.unmount(); await Promise.resolve(); equal(host.childNodes.length, 0); throws(() => set(2), 'ERR_COMPONENT_LIFECYCLE');
}));
test('22 비동기 갱신 오류는 onError로 전달', () => fixture(async (host, create) => {
  const errors = []; const app = create(() => { const [n, set] = useState(0); useEffect(() => { set(1); }, []); if (n) throw Error('queued failure'); return view(n); }, {}, { onError: error => errors.push(error) }); app.mount(); await Promise.resolve(); equal(errors.length, 1); equal(host.textContent, '0');
}));
test('23 복수 루트 State와 Hook 문맥 격리', () => fixture((host, create) => {
  let setA, setB; const a = create(() => { const [n, set] = useState(1); setA = set; return view(n); }); a.mount(); const secondHost = document.createElement('div'); host.append(secondHost); const b = new FunctionComponent(() => { const [n, set] = useState(10); setB = set; return view(n); }, secondHost);
  try { b.mount(); setA(2); setB(11); equal(a.root.textContent, '2'); equal(b.root.textContent, '11'); } finally { if (b.mounted) b.unmount(); }
}));
test('24 lifecycle 잘못된 호출과 unmount 뒤 setter 거부', () => fixture((host, create) => {
  let set; const app = create(() => { const [n, setter] = useState(0); set = setter; return view(n); }); throws(() => app.update(), 'ERR_COMPONENT_LIFECYCLE'); app.mount(); throws(() => app.mount(), 'ERR_COMPONENT_LIFECYCLE'); app.unmount(); throws(() => set(1), 'ERR_COMPONENT_LIFECYCLE'); throws(() => app.update(), 'ERR_COMPONENT_LIFECYCLE');
}));
test('25 input 상태 갱신은 DOM 참조·포커스와 value 유지', () => fixture((host, create) => {
  const app = create(() => { const [value, set] = useState('a'); return { ...e('input'), domProps: { value }, events: { input: event => set(event.target.value) } }; }); app.mount(); const input = host.firstChild; input.focus(); input.value = 'abc'; input.dispatchEvent(new Event('input', { bubbles: true })); equal(app.hooks[0].value, 'abc'); equal(host.firstChild, input); equal(document.activeElement, input); equal(input.value, 'abc');
}));
test('26 unmount는 제거한 DOM의 이벤트도 해제', () => fixture((host, create) => {
  let clicks = 0; const app = create(() => ({ ...view('button'), events: { click: () => clicks++ } })); app.mount(); const node = app.root; node.click(); app.unmount(); node.click(); equal(clicks, 1);
}));
test('27 State 초기화/Memo factory 안 중첩 Hook 금지', () => fixture((host, create) => {
  for (const hook of [() => useState(() => useState(1)), () => useMemo(() => useState(1), [])]) { const app = create(() => { hook(); return view('bad'); }); throws(() => app.mount(), 'ERR_HOOK_CONTEXT'); }
}));
test('28 Patch 실패는 이전 State 화면 복구, 기존 이벤트 해제', () => fixture((host, create) => {
  let set, clicks = 0; const app = create(() => { const [n, setter] = useState(0); set = setter; return { ...view(n), events: { click: () => clicks++ } }; });
  app.mount(); const old = app.root; old.append(document.createElement('span')); throws(() => set(1)); equal(app.hooks[0].value, 0); equal(host.textContent, '0'); assert(app.root !== old); old.click(); equal(clicks, 0); set(2); equal(host.textContent, '2');
}));
test('29 복구마저 실패하면 후속 갱신 차단', () => fixture((host, create) => {
  let set; const app = create(() => { const [n, setter] = useState(0); set = setter; return view(n); }); app.mount(); app.root.append(document.createElement('span'));
  const replace = host.replaceChildren; host.replaceChildren = () => { throw Error('recovery failed'); };
  try { throws(() => set(1)); assert(app.blocked); throws(() => set(2), 'ERR_COMPONENT_LIFECYCLE'); equal(app.hooks[0].value, 0); }
  finally { host.replaceChildren = replace; }
}));
test('30 첫 렌더에서도 setter 호출을 명시적으로 거부', () => fixture((host, create) => {
  const app = create(() => { const [, set] = useState(0); set(1); return view('bad'); }); throws(() => app.mount(), 'ERR_RENDER_UPDATE'); equal(host.childNodes.length, 0);
}));
test('31 희소 의존성 배열도 인덱스 값으로 비교', () => fixture((host, create) => {
  let deps = Array(1), calls = 0; const app = create(() => { useMemo(() => calls++, deps); return view('ok'); }); app.mount(); deps = [1]; app.update(); equal(calls, 2);
}));
test('32 DOM 지원범위 검증 실패는 이전 노드 참조도 보존', () => fixture((host, create) => {
  let set, invalid; const app = create(() => { const [n, setter] = useState(0); set = setter; return invalid ? invalid() : view(n); }); app.mount(); const root = app.root;
  for (invalid of [() => e('script'), () => e('p', [], { onclick: 'bad()' }), () => ({ ...e('input'), domProps: { innerHTML: 'bad' } })]) { throws(() => set(1), 'ERR_INVALID_HTML'); equal(app.root, root); equal(app.hooks[0].value, 0); }
}));
test('33 루트 교체 직후 Patch 실패해도 새 노드 이벤트를 해제', () => fixture((host, create) => {
  let set, partial, clicks = 0; const app = create(() => { const [n, setter] = useState(0); set = setter; return { ...e(n ? 'strong' : 'p', [t(String(n))]), events: { click: () => clicks++ } }; }); app.mount(); const original = host.replaceChild;
  host.replaceChild = function (next, previous) { partial = next; original.call(this, next, previous); throw Error('after replacement'); };
  try { throws(() => set(1)); equal(host.textContent, '0'); assert(partial); partial.click(); equal(clicks, 0); }
  finally { host.replaceChild = original; }
}));
test('34 State 슬롯은 Memo 사이에서도 서로 독립적', () => fixture((host, create) => {
  let setFirst, setSecond; const app = create(() => { const [a, first] = useState(1); useMemo(() => a * 2, [a]); const [b, second] = useState(10); setFirst = first; setSecond = second; return view(`${a}:${b}`); }); app.mount(); setFirst(2); setSecond(n => n + 1); equal(host.textContent, '2:11'); equal(app.hooks[0].value, 2); equal(app.hooks[2].value, 11);
}));
test('35 함수형 updater 안 setter 재진입은 변경 전에 거부', () => fixture((host, create) => {
  let set; const app = create(() => { const [n, setter] = useState(0); set = setter; return view(n); }); app.mount(); throws(() => set(n => { set(5); return n + 1; }), 'ERR_RENDER_UPDATE'); equal(host.textContent, '0'); equal(app.hooks[0].value, 0);
}));
test('36 복구 실패로 남은 부분 교체 DOM도 unmount에서 제거', () => fixture((host, create) => {
  let set; const app = create(() => { const [n, setter] = useState(0); set = setter; return e(n ? 'strong' : 'p', [t(String(n))]); }); app.mount();
  const replace = host.replaceChild, replaceAll = host.replaceChildren;
  host.replaceChild = function (next, previous) { replace.call(this, next, previous); throw Error('partial root'); };
  host.replaceChildren = () => { throw Error('recovery failed'); };
  try { throws(() => set(1)); assert(app.blocked); }
  finally { host.replaceChild = replace; host.replaceChildren = replaceAll; }
  app.unmount(); equal(host.childNodes.length, 0);
}));
