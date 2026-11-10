import { element, text, validateVNode } from './vnode.js';
import { isSupportedTag, isSupportedAttribute, isWhitespace, isIgnoredText } from './html-policy.js';

const references = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function serializeHTML(tree) {
  validateVNode(tree);
  const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const escape = value => value.replace(/[&<>"]/g, character => escaped[character]);
  function serialize(node, depth = 0) {
    if (node.kind === 'text') {
      if (node.value === '' || isIgnoredText(node.value)) invalid('HTML 소스로 표현할 수 없는 텍스트', 0);
      return escape(node.value);
    }
    if (!isSupportedTag(node.tag) || Object.keys(node.attrs).some(name => !isSupportedAttribute(name))
      || Object.keys(node.events ?? {}).length || Object.keys(node.domProps ?? {}).length) {
      invalid('Phase 1에서 지원하지 않는 요소·속성', 0);
    }
    const attrs = Object.entries(node.attrs).map(([name, value]) => ` ${name}="${escape(value)}"`).join('');
    const block = node.children.length > 0 && node.children.every(child => child.kind === 'element');
    const content = block ? '\n' + node.children.map(child => '  '.repeat(depth + 1) + serialize(child, depth + 1)).join('\n') + '\n' + '  '.repeat(depth)
      : node.children.map((child, index) => {
      const boundary = child.kind === 'text' && node.children[index - 1]?.kind === 'text' ? '<!-- -->' : '';
      return boundary + serialize(child, depth + 1);
    }).join('');
    return `<${node.tag}${attrs}>${content}</${node.tag}>`;
  }
  return serialize(tree);
}

function invalid(message, offset) {
  throw Object.assign(new Error(`${message} (offset ${offset})`), { code: 'ERR_INVALID_HTML' });
}

function decode(value, offset) {
  return value.replace(/&([^;\s<&]*;)?/g, (match) => {
    const name = match.slice(1, -1);
    if (!match.endsWith(';') || !Object.hasOwn(references, name)) {
      invalid('지원하지 않는 문자 참조', offset);
    }
    return references[name];
  });
}

// 브라우저의 HTML 자동 보정 없이 프로젝트의 작은 입력 문법만 해석한다.
export function parseHTML(source) {
  if (typeof source !== 'string') invalid('HTML 문자열이 필요합니다', 0);
  let offset = 0;
  let root = null;
  const stack = [];

  while (offset < source.length) {
    if (source.startsWith('<!--', offset)) {
      const end = source.indexOf('-->', offset + 4);
      if (end === -1) invalid('닫히지 않은 주석', offset);
      offset = end + 3;
      continue;
    }

    if (source[offset] !== '<') {
      const end = source.indexOf('<', offset);
      const raw = source.slice(offset, end === -1 ? source.length : end);
      if (stack.length === 0) {
        if (!isWhitespace(raw)) invalid('루트 바깥 텍스트', offset);
      } else {
        const value = decode(raw, offset);
        if (!isIgnoredText(value)) {
          stack.at(-1).children.push(text(value));
        }
      }
      offset += raw.length;
      continue;
    }

    const close = /^<\/([a-z][a-z0-9]*)[\t\n\f\r ]*>/.exec(source.slice(offset));
    if (close) {
      if (stack.at(-1)?.tag !== close[1]) invalid('닫는 태그 불일치', offset);
      stack.pop();
      offset += close[0].length;
      continue;
    }

    const open = /^<([a-z][a-z0-9]*)(?=[\t\n\f\r >])/.exec(source.slice(offset));
    if (!open || !isSupportedTag(open[1])) invalid('지원하지 않는 시작 태그', offset);
    offset += open[0].length;
    const attrs = {};
    while (source[offset] !== '>') {
      const gap = /^[\t\n\f\r ]+/.exec(source.slice(offset));
      if (!gap) invalid('속성 사이 공백 또는 태그 종료가 필요합니다', offset);
      offset += gap[0].length;
      if (source[offset] === '>') break;
      const attr = /^([a-z][a-z0-9-]*)[\t\n\f\r ]*=[\t\n\f\r ]*(["'])([^]*?)\2/.exec(source.slice(offset));
      if (!attr || !isSupportedAttribute(attr[1]) || attr[3].includes('<')) invalid('지원하지 않거나 잘못된 속성', offset);
      if (Object.hasOwn(attrs, attr[1])) invalid('중복 속성', offset);
      attrs[attr[1]] = decode(attr[3], offset);
      offset += attr[0].length;
    }
    offset += 1;

    const node = element(open[1], [], attrs);
    if (stack.length > 0) stack.at(-1).children.push(node);
    else if (root !== null) invalid('바깥 요소는 하나만 허용합니다', offset);
    else root = node;
    stack.push(node);
  }

  if (root === null || stack.length > 0) invalid('바깥 요소 또는 닫는 태그가 필요합니다', offset);
  validateVNode(root);
  return root;
}
