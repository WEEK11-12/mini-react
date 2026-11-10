// Browser review entry: re-export only the actual product implementation.
export { diff } from '../../src/core/diff';
export { readDOM } from '../../src/core/dom-reader';
export { applyPlan, mountTree } from '../../src/core/patch';
export { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';
