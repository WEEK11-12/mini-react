import { FunctionComponent } from '../core/component';
import { useEffect, useMemo, useState } from '../core/hooks';
import { h, type Child, type Props } from '../core/vdom';

interface DemoElements {
  cart: HTMLElement;
  list: HTMLElement;
  unmount: HTMLButtonElement;
  restart: HTMLButtonElement;
  reverse: HTMLButtonElement;
  prepend: HTMLButtonElement;
  remove: HTMLButtonElement;
  memoCount: HTMLElement;
  setupCount: HTMLElement;
  cleanupCount: HTMLElement;
  status: HTMLElement;
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
        unsubscribe();
        cleanups += 1;
        view.cleanupCount.textContent = String(cleanups);
      };
    }, [productId]);
    return h('div', null,
      h(ProductCard, { productId, stock: inventory, quantity, total, onIncrease: () => run(() => setQuantity((value) => value + 1)) }),
      h('button', { attrs: { type: 'button', 'data-testid': 'change-product' }, events: { click: () => run(() => setProductId((value) => value === '사과' ? '배' : '사과')) } }, '상품 변경'),
      h('label', { attrs: { for: 'cart-memo' } }, '메모'),
      h('input', { attrs: { id: 'cart-memo', type: 'text', 'data-testid': 'memo-input' }, domProps: { value: memo }, events: { input: (event: Event) => run(() => setMemo((event.target as HTMLInputElement).value)) } }),
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
  function run(action: () => void): void {
    let errorMessage = '';
    try {
      action();
      showCounts();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    if (cart.phase === 'faulted') {
      failures.cart ||= errorMessage || '중단됨';
      view.cart.inert = true;
    } else failures.cart = '';
    if (list.phase === 'faulted') {
      failures.list ||= errorMessage || '중단됨';
      view.list.inert = true;
    } else failures.list = '';
    const pending = [failures.cart && `장바구니: ${failures.cart}`, failures.list && `목록: ${failures.list}`].filter(Boolean);
    view.status.textContent = pending.length ? `${pending.join(' · ')} · 제거·다시 시작으로 복구하세요.` : errorMessage;
  }
  const remove = () => run(() => {
    cart.unmount();
    view.cart.inert = false;
  });
  const restart = () => run(() => {
    if (cart.phase !== 'unmounted') cart.unmount();
    cart.mount(view.cart, undefined);
    view.cart.inert = false;
    if (list.phase === 'faulted') {
      list.unmount();
      list.mount(view.list, undefined);
      view.list.inert = false;
    }
  });
  const reverse = () => run(() => setItems?.((items) => [...items].reverse()));
  const prepend = () => run(() => setItems?.((items) => [`new-${nextItem++}`, ...items]));
  const removeItem = () => run(() => setItems?.((items) => items.slice(1)));
  view.unmount.addEventListener('click', remove);
  view.restart.addEventListener('click', restart);
  view.reverse.addEventListener('click', reverse);
  view.prepend.addEventListener('click', prepend);
  view.remove.addEventListener('click', removeItem);
  run(() => { cart.mount(view.cart, undefined); list.mount(view.list, undefined); });
  return () => {
    view.unmount.removeEventListener('click', remove);
    view.restart.removeEventListener('click', restart);
    view.reverse.removeEventListener('click', reverse);
    view.prepend.removeEventListener('click', prepend);
    view.remove.removeEventListener('click', removeItem);
    const errors: unknown[] = [];
    try { cart.unmount(); } catch (error) { errors.push(error); }
    try { list.unmount(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Component demo removal failed');
  };
}
