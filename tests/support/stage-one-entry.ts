// Re-export the actual stage-one library for a browser fixture, not an application substitute.
export { readDOM } from '../../src/core/dom-reader';
export { mountTree } from '../../src/core/patch';
export { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';
