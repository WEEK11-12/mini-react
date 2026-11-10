import { createPlayground } from './playground.js';

const find = id => document.getElementById(id);
createPlayground({
  actual: find('actual'), preview: find('preview'), editor: find('editor'),
  patchButton: find('patch'), backButton: find('back'), forwardButton: find('forward'),
  error: find('error'), status: find('status'),
});
