import { FunctionComponent } from '../core/component';
import { useEffect, useMemo, useState } from '../core/hooks';
import { h, type Child, type Props } from '../core/vdom';

interface DemoElements {
  cart: HTMLElement;
  list: HTMLElement;
  unmount: HTMLButtonElement;
  restart: HTMLButtonElement;
  restartList: HTMLButtonElement;
  reverse: HTMLButtonElement;
  prepend: HTMLButtonElement;
  remove: HTMLButtonElement;
  memoCount: HTMLElement;
  setupCount: HTMLElement;
  cleanupCount: HTMLElement;
  status: HTMLElement;
  cartState: HTMLElement;
  listState: HTMLElement;
  cartEmpty: HTMLElement;
  listEmpty: HTMLElement;
  listOrder: HTMLElement;
  listCount: HTMLElement;
  cartError: HTMLElement;
  listError: HTMLElement;
}

function ProductCard(props: Props): Child {
  return h('article', null,
    h('h3', null, String(props.productId)),
    h('p', null, '재고: ', String(props.stock)),
    h('p', null, '수량: ', h('span', { attrs: { 'data-testid': 'quantity' } }, String(props.quantity))),
    h('p', null, '합계: ', h('span', { attrs: { 'data-testid': 'total' } }, String(props.total))),
    h('button', { attrs: { type: 'button', 'data-testid': 'increase-quantity' }, events: { click: props.onIncrease as () => void } }, '수량 증가'),
  );
}

function ListItem(props: Props): Child {
  return h('li', { attrs: { 'data-testid': 'list-item' } }, String(props.label));
}

export function startCartDemo(view: DemoElements): () => void {
  let memoCalculations = 0;
  let setups = 0;
  let cleanups = 0;
  let nextItem = 1;
  const stock = new Map([['사과', 12], ['배', 8]]);
  const subscribers = new Map<string, Set<(value: number) => void>>();
  let setItems: ((next: (items: string[]) => string[]) => void) | undefined;

  function subscribe(productId: string, notify: (value: number) => void): () => void {
    const listeners = subscribers.get(productId) ?? new Set();
    subscribers.set(productId, listeners);
    listeners.add(notify);
    notify(stock.get(productId) ?? 0);
    return () => {
      listeners.delete(notify);
      if (!listeners.size) subscribers.delete(productId);
    };
  }

  function Cart(): Child {
    const [quantity, setQuantity] = useState(1);
    const [productId, setProductId] = useState('사과');
    const [memo, setMemo] = useState('');
    const [inventory, setInventory] = useState(0);
    const total = useMemo(() => {
      memoCalculations += 1;
      return quantity * (productId === '사과' ? 1500 : 2000);
    }, [quantity, productId]);
    useEffect(() => {
      setups += 1;
      view.setupCount.textContent = String(setups);
      const unsubscribe = subscribe(productId, setInventory);
      return () => {
        cleanups += 1;
        const errors: unknown[] = [];
        try { unsubscribe(); }
        catch (error) {
          warnings.cart = `구독 정리 오류: ${describe(error)} · 이전 자원 해제는 확인되지 않았습니다. 새 시작도 과거 정리 완료를 보증하지 않습니다.`;
          errors.push(error);
        }
        try { view.cleanupCount.textContent = String(cleanups); }
        catch (error) { errors.push(error); }
        if (errors.length > 1) throw new AggregateError(errors, 'Subscription cleanup and count display failed');
        if (errors.length) throw errors[0];
      };
    }, [productId]);
    return h('div', null,
      h(ProductCard, { productId, stock: inventory, quantity, total, onIncrease: () => run(() => setQuantity((value) => value + 1), 'cart') }),
      h('button', { attrs: { type: 'button', 'data-testid': 'change-product' }, events: { click: () => run(() => setProductId((value) => value === '사과' ? '배' : '사과'), 'cart') } }, '상품 변경'),
      h('label', { attrs: { for: 'cart-memo' } }, '메모'),
      h('input', { attrs: { id: 'cart-memo', type: 'text', 'data-testid': 'memo-input' }, domProps: { value: memo }, events: { input: (event: Event) => run(() => setMemo((event.target as HTMLInputElement).value), 'cart') } }),
      h('p', { attrs: { 'data-testid': 'memo-output' } }, memo),
    );
  }

  function KeyedList(): Child {
    const [items, updateItems] = useState(['a', 'b', 'c']);
    setItems = updateItems;
    return h('ul', null, items.map((label) => h(ListItem, { key: label, label })));
  }

  const cart = new FunctionComponent(Cart);
  const list = new FunctionComponent(KeyedList);
  const showCounts = () => { view.memoCount.textContent = String(memoCalculations); };
  const failures = { cart: '', list: '' };
  const warnings = { cart: '', list: '' };
  function describe(error: unknown): string {
    if (error instanceof AggregateError) return `${error.message}: ${error.errors.map(describe).join(' · ')}`;
    return error instanceof Error ? error.message : String(error);
  }
  function unmount(root: 'cart' | 'list'): void {
    try { (root === 'cart' ? cart : list).unmount(); }
    catch (error) {
      const reason = describe(error);
      warnings[root] = `정리 오류: ${reason} · 이전 자원 해제는 확인되지 않았습니다. 새 시작도 과거 정리 완료를 보증하지 않습니다.`;
      throw error;
    }
  }
  function run(action: () => void, owner: 'cart' | 'list', recovery = false): void {
    const focusedCart = view.cart.contains(view.cart.ownerDocument.activeElement);
    const focusedList = view.list.contains(view.list.ownerDocument.activeElement);
    const focusedUnmount = view.unmount === view.unmount.ownerDocument.activeElement;
    const focusedRestartList = view.restartList === view.restartList.ownerDocument.activeElement;
    let errorMessage = '';
    try {
      action();
      if (recovery) failures[owner] = '';
    } catch (error) {
      errorMessage = describe(error);
      if (owner === 'cart' && error instanceof AggregateError && error.message === 'Effect execution failed') {
        warnings.cart ||= `Effect 오류: 자원 정리 완료는 확인되지 않았습니다. 새 시작도 과거 정리 완료를 보증하지 않습니다.`;
      }
      failures[owner] = `${owner === 'cart' ? '장바구니' : '목록'} 작업 오류: ${errorMessage} · ${recovery && (owner === 'cart' ? cart : list).phase === 'unmounted' ? '새 시작 미실행. 다시 시작을 누르세요.' : '해당 카드 초기화·시작으로 복구하세요.'}`;
    }
    showCounts();
    if (cart.phase === 'faulted') {
      failures.cart ||= '장바구니 중단됨 · 초기화·시작으로 복구하세요.';
      view.cart.inert = true;
    }
    if (list.phase === 'faulted') {
      failures.list ||= '목록 중단됨 · 초기화·시작으로 복구하세요.';
      view.list.inert = true;
    }
    view.cartState.textContent = cart.phase === 'faulted' ? '오류로 중단됨' : cart.phase === 'unmounted' ? '종료됨' : '실행 중';
    view.listState.textContent = list.phase === 'faulted' ? '오류로 중단됨' : list.phase === 'unmounted' ? '종료됨' : '실행 중';
    view.cartState.dataset.phase = cart.phase;
    view.listState.dataset.phase = list.phase;
    view.unmount.disabled = cart.phase === 'unmounted';
    view.cartEmpty.hidden = cart.phase !== 'unmounted';
    view.restartList.hidden = list.phase === 'idle' && !failures.list;
    const items = [...view.list.querySelectorAll('[data-key]')].map((node) => node.getAttribute('data-key') ?? '');
    view.listOrder.textContent = items.length ? items.join(' → ') : '없음';
    view.listCount.textContent = String(items.length);
    view.listEmpty.hidden = list.phase !== 'idle' || items.length !== 0;
    view.reverse.disabled = list.phase !== 'idle' || items.length === 0;
    view.prepend.disabled = list.phase !== 'idle';
    view.remove.disabled = list.phase !== 'idle' || items.length === 0;
    view.cartError.textContent = [failures.cart, warnings.cart].filter(Boolean).join(' · ');
    view.listError.textContent = [failures.list, warnings.list].filter(Boolean).join(' · ');
    const pending = [view.cartError.textContent && `장바구니: ${view.cartError.textContent}`, view.listError.textContent && `목록: ${view.listError.textContent}`].filter(Boolean);
    view.status.textContent = pending.join(' · ');
    if ((focusedCart && cart.phase !== 'idle') || (focusedUnmount && view.unmount.disabled)) view.restart.focus();
    if (focusedList && list.phase !== 'idle') view.restartList.focus();
    if (focusedRestartList && view.restartList.hidden) view.prepend.focus();
  }
  const remove = () => run(() => {
    unmount('cart');
    view.cart.inert = false;
  }, 'cart');
  const restart = () => run(() => {
    if (cart.phase !== 'unmounted') unmount('cart');
    cart.mount(view.cart, undefined);
    view.cart.inert = false;
  }, 'cart', true);
  const restartList = () => run(() => {
    if (list.phase !== 'unmounted') unmount('list');
    list.mount(view.list, undefined);
    view.list.inert = false;
  }, 'list', true);
  const reverse = () => run(() => setItems?.((items) => [...items].reverse()), 'list');
  const prepend = () => run(() => setItems?.((items) => [`new-${nextItem++}`, ...items]), 'list');
  const removeItem = () => run(() => setItems?.((items) => items.slice(1)), 'list');
  view.unmount.addEventListener('click', remove);
  view.restart.addEventListener('click', restart);
  view.restartList.addEventListener('click', restartList);
  view.reverse.addEventListener('click', reverse);
  view.prepend.addEventListener('click', prepend);
  view.remove.addEventListener('click', removeItem);
  run(() => cart.mount(view.cart, undefined), 'cart');
  run(() => list.mount(view.list, undefined), 'list');
  return () => {
    view.unmount.removeEventListener('click', remove);
    view.restart.removeEventListener('click', restart);
    view.restartList.removeEventListener('click', restartList);
    view.reverse.removeEventListener('click', reverse);
    view.prepend.removeEventListener('click', prepend);
    view.remove.removeEventListener('click', removeItem);
    const errors: unknown[] = [];
    try { cart.unmount(); } catch (error) { errors.push(error); }
    try { list.unmount(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Component demo removal failed');
  };
}
