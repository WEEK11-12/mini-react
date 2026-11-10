import { createPlayground } from './playground.js';
import { createInspector } from './inspector.js';

const find = id => document.getElementById(id);
const inspector = find('inspector') ? createInspector(find('inspector')) : null;
createPlayground({
  actual: find('actual'), preview: find('preview'), editor: find('editor'),
  patchButton: find('patch'), backButton: find('back'), forwardButton: find('forward'),
  error: find('error'), status: find('status'),
  onCommit: event => inspector?.commit(event),
  onRecovery: event => inspector?.resync(event),
});
