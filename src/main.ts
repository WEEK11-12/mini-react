import { startPlayground } from './playground/controller';
import { startCartDemo } from './demo/cart';

function required<T extends HTMLElement>(selector: string, type: new (...args: never[]) => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing playground element: ${selector}`);
  return element;
}

const tabs = [...document.querySelectorAll<HTMLButtonElement>('.phase-tabs [role="tab"]')];
function selectTab(tab: HTMLButtonElement): void {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    required(`#${item.getAttribute('aria-controls')}`, HTMLElement).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1]
      : tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
}

const stop = startPlayground({
  actual: required('[data-testid="actual-region"]', HTMLElement),
  preview: required('[data-testid="preview-region"]', HTMLElement),
  editor: required('[data-testid="html-editor"]', HTMLTextAreaElement),
  patch: required('[data-testid="patch-button"]', HTMLButtonElement),
  back: required('[data-testid="back-button"]', HTMLButtonElement),
  forward: required('[data-testid="forward-button"]', HTMLButtonElement),
  status: required('[data-testid="status"]', HTMLElement),
});
const stopDemo = startCartDemo({
  cart: required('[data-testid="component-demo"]', HTMLElement),
  list: required('[data-testid="keyed-list-demo"]', HTMLElement),
  unmount: required('[data-testid="unmount-component"]', HTMLButtonElement),
  restart: required('[data-testid="restart-component"]', HTMLButtonElement),
  restartList: required('[data-testid="restart-list"]', HTMLButtonElement),
  reverse: required('[data-testid="reverse-list"]', HTMLButtonElement),
  prepend: required('[data-testid="prepend-list-item"]', HTMLButtonElement),
  remove: required('[data-testid="remove-list-item"]', HTMLButtonElement),
  memoCount: required('[data-testid="memo-count"]', HTMLElement),
  setupCount: required('[data-testid="effect-setup-count"]', HTMLElement),
  cleanupCount: required('[data-testid="effect-cleanup-count"]', HTMLElement),
  status: required('[data-testid="component-status"]', HTMLElement),
  cartState: required('[data-testid="cart-state"]', HTMLElement),
  listState: required('[data-testid="list-state"]', HTMLElement),
  cartEmpty: required('[data-testid="cart-empty"]', HTMLElement),
  listEmpty: required('[data-testid="list-empty"]', HTMLElement),
  listOrder: required('[data-testid="list-order"]', HTMLElement),
  listCount: required('[data-testid="list-count"]', HTMLElement),
  cartError: required('[data-testid="cart-error"]', HTMLElement),
  listError: required('[data-testid="list-error"]', HTMLElement),
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    const errors: unknown[] = [];
    try { stopDemo(); } catch (error) { errors.push(error); }
    try { stop(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Page cleanup failed');
  }
});
