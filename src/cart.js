import { FunctionComponent, useState, useMemo, useEffect, renderChild } from './component.js';
import { element as e, text as t } from './vnode.js';

const container = document.querySelector('#cart-root');
const status = document.querySelector('#runtime-status');
const lifecycle = document.querySelector('#lifecycle-toggle');
const originalTitle = document.title;
const showError = error => { status.textContent = `화면 갱신 실패: ${error.message}`; };
const handleAction = action => event => {
  try { action(event); } catch (error) { showError(error); }
};
const money = value => `${value.toLocaleString('ko-KR')}원`;
const initialItems = () => [
  { id: 'apple', name: '사과', price: 2000, quantity: 1 },
  { id: 'pear', name: '배', price: 3000, quantity: 1 },
];
const button = (label, handler, attrs = {}) => ({
  ...e('button', [t(label)], { type: 'button', ...attrs }),
  events: { click: handleAction(handler) },
});

function Product({ item, changeQuantity, remove }) {
  const quantityId = `quantity-${item.id}`;
  return e('li', [
    e('div', [
      e('strong', [t(item.name)]),
      button('삭제', () => remove(item.id), {
        class: 'remove', 'data-action': 'remove', 'aria-label': `${item.name} 삭제`,
      }),
    ], { class: 'item-heading' }),
    e('p', [t(`개당 ${money(item.price)}`)], { class: 'muted' }),
    e('div', [
      e('label', [t('수량')], { for: quantityId }),
      button('−', () => changeQuantity(item.id, item.quantity - 1), {
        'data-action': 'decrement', 'aria-label': `${item.name} 수량 감소`,
        ...(item.quantity === 0 ? { disabled: '' } : {}),
      }),
      {
        ...e('input', [], {
          id: quantityId, type: 'text', name: quantityId,
          'aria-label': `${item.name} 수량`, 'aria-describedby': 'quantity-help',
        }),
        domProps: { value: String(item.quantity) },
        events: { input: handleAction(event => changeQuantity(item.id, event.target.value)) },
      },
      button('+', () => changeQuantity(item.id, item.quantity + 1), {
        'data-action': 'increment', 'aria-label': `${item.name} 수량 증가`,
        ...(item.quantity === 99 ? { disabled: '' } : {}),
      }),
      e('span', [t(money(item.price * item.quantity))], { 'data-testid': `subtotal-${item.id}` }),
    ], { class: 'quantity-controls' }),
  ], { class: 'cart-item', 'data-key': item.id, 'data-testid': `item-${item.id}` });
}

function Summary({ total, count, calculations }) {
  return e('div', [
    e('p', [t(`상품 총수량 ${count}개`)], { 'data-testid': 'total-count' }),
    e('div', [e('span', [t('합계')]), e('strong', [t(money(total))], { 'data-testid': 'total' })], { class: 'summary-row' }),
    e('p', [t(`합계 계산 ${calculations}회 · 테마 변경 시 이전 계산 결과 재사용`)], {
      class: 'memo-note muted', 'data-testid': 'memo-count',
    }),
  ], { class: 'cart-summary' });
}

let instance;
let mounted = false;
let effectRuns = 0;
let effectCleanups = 0;

function createCart() {
  let calculations = 0;
  return function Cart() {
    const [items, setItems] = useState(initialItems);
    const [dark, setDark] = useState(false);
    const total = useMemo(() => {
      calculations += 1;
      return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }, [items]);
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    useEffect(() => {
      document.title = `장바구니 ${count}개 · mini-react`;
      document.querySelector('#effect-runs').value = String(++effectRuns);
      return () => {
        document.title = originalTitle;
        document.querySelector('#effect-cleanups').value = String(++effectCleanups);
      };
    }, [count]);

    const changeQuantity = (id, raw) => {
      const value = String(raw);
      if (!/^\d+$/.test(value) || Number(value) > 99) {
        status.textContent = '수량은 0부터 99까지의 정수로 입력해 주세요.';
        instance.update();
        return;
      }
      status.textContent = '';
      const quantity = Number(value);
      const current = items.find(item => item.id === id);
      if (current.quantity === quantity) {
        instance.update();
        return;
      }
      setItems(previous => previous.map(item => item.id === id ? { ...item, quantity } : item));
    };
    const remove = id => {
      status.textContent = '';
      setItems(previous => previous.filter(item => item.id !== id));
    };
    return e('div', [
      e('div', [
        e('h2', [t('나의 장바구니')]),
        button(dark ? '밝은 테마로' : '어두운 테마로', () => {
          status.textContent = '';
          setDark(previous => !previous);
        }, { 'data-action': 'theme' }),
      ], { class: 'cart-header' }),
      e('p', [t('수량은 0~99개입니다. 빈 값·문자·소수는 이전 수량으로 돌아갑니다.')], {
        id: 'quantity-help', class: 'muted',
      }),
      e('ul', items.map(item => renderChild(Product, { item, changeQuantity, remove })), { class: 'cart-list' }),
      renderChild(Summary, { total, count, calculations }),
      e('div', [button('상품 초기화', () => {
        status.textContent = '';
        setItems(initialItems());
      }, { 'data-action': 'reset' })], { class: 'cart-actions' }),
      ...(items.length === 0 ? [e('p', [t('장바구니가 비었습니다. 상품을 초기화해 다시 시작하세요.')], { 'data-testid': 'empty-cart' })] : []),
    ], { class: dark ? 'cart dark' : 'cart', 'data-testid': 'cart' });
  };
}

function mount() {
  status.textContent = '';
  instance = new FunctionComponent(createCart(), container, {}, {
    onError: showError,
  });
  try { instance.mount(); } finally {
    mounted = instance.mounted;
    lifecycle.textContent = mounted ? '컴포넌트 종료' : '컴포넌트 다시 시작';
  }
}

lifecycle.addEventListener('click', handleAction(() => {
  if (mounted) {
    try { instance.unmount(); } finally {
      mounted = instance.mounted;
      lifecycle.textContent = mounted ? '컴포넌트 종료' : '컴포넌트 다시 시작';
    }
    status.textContent = '컴포넌트를 종료하고 Effect를 정리했습니다.';
  } else {
    mount();
  }
}));

handleAction(mount)();
