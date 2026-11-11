const tags = new Set(['div', 'h2', 'p', 'strong', 'ul', 'li', 'span']);

export const isSupportedTag = (tag) => tags.has(tag);
export const isSupportedAttribute = (name) => /^(class|title|data-[a-z][a-z0-9-]*)$/.test(name);
export const isWhitespace = (value) => /^[\t\n\f\r ]*$/.test(value);
export const isIgnoredText = (value) => isWhitespace(value) && /[\r\n]/.test(value);
