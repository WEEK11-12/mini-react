import { startPlayground } from './playground/controller';

function required<T extends HTMLElement>(selector: string, type: new (...args: never[]) => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing playground element: ${selector}`);
  return element;
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
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) stop();
});
