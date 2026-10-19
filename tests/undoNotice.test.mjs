import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndoNotice } from '../src/ui/components/undoNotice.js';

class Element {
  constructor() { this.children = []; this.listeners = {}; }
  setAttribute() {}
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { this.children.push(node); node.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  contains(node) { return this.children.includes(node); }
  addEventListener(event, listener) { this.listeners[event] = listener; }
}

test('undo: text is literal, double click runs once, failure can be retried', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new Element(), activeElement: null };
  const host = new Element();
  const notice = createUndoNotice(host);
  let calls = 0;
  try {
    notice.show('<img onerror=x>', async () => { calls++; });
    const row = host.children[0], button = row.children[1];
    assert.equal(row.children[0].textContent, '<img onerror=x>');
    await Promise.all([button.onclick(), button.onclick()]);
    assert.equal(calls, 1);
    assert.equal(row.children[0].textContent, 'Operazione annullata.');
    let fails = true;
    notice.show('Eliminata', async () => { if (fails) throw Error('simulated'); calls++; });
    const retry = host.children[1].children[1];
    await retry.onclick();
    assert.equal(retry.disabled, false);
    fails = false;
    await retry.onclick();
    assert.equal(calls, 2);
    notice.dispose();
    assert.equal(host.children.length, 0);
  } finally {
    notice.dispose();
    globalThis.document = previous;
  }
});
