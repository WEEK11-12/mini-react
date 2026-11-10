export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const HTML_SPACE = /[\t\n\f\r ]+/;
export const TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'main',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em',
  'br', 'label', 'button', 'input', 'textarea',
]);
export const ARIA_STRINGS = new Set([
  'aria-label', 'aria-hidden', 'aria-live', 'aria-expanded', 'aria-checked',
  'aria-disabled', 'aria-pressed',
]);
export const ID_REFERENCES = new Set(['for', 'aria-activedescendant', 'aria-errormessage']);
export const ID_LISTS = new Set([
  'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-flowto',
]);
const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  label: ['for'], button: ['type', 'disabled'],
  input: ['type', 'name', 'placeholder', 'disabled', 'value', 'checked'],
  textarea: ['name', 'placeholder', 'disabled'],
};

export function isSupportedAttribute(tag: string, name: string): boolean {
  if (/[A-Z]/.test(name)) return false;
  return ['id', 'class', 'title'].includes(name)
    || /^data-[^\s"'<>/=]+$/.test(name)
    || ARIA_STRINGS.has(name) || ID_LISTS.has(name)
    || (ID_REFERENCES.has(name) && name !== 'for')
    || (ATTRIBUTES[tag]?.includes(name) ?? false);
}

export function idTokens(value: string): string[] {
  return value.split(HTML_SPACE).filter(Boolean);
}

export function normalizeAttribute(name: string, value: string): string {
  return ID_LISTS.has(name) ? idTokens(value).join(' ') : value;
}
