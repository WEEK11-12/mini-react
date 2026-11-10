// Browser-only entry: expose actual implementation; no Patch/app substitute.
export { diff } from '../../src/core/diff';
export { readDOM } from '../../src/core/dom-reader';
export { mountTree } from '../../src/core/patch';
export { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';
