import test from 'node:test';
import assert from 'node:assert/strict';
import { isEditableElement } from '../lib/utils/dom-guards.ts';

test('isEditableElement - Returns false for null, undefined, or non-editable tags', () => {
  assert.equal(isEditableElement(null), false);
  assert.equal(isEditableElement(undefined), false);
  assert.equal(isEditableElement({ tagName: 'DIV' }), false);
  assert.equal(isEditableElement({ tagName: 'BUTTON' }), false);
  assert.equal(isEditableElement({ tagName: 'SPAN' }), false);
});

test('isEditableElement - Identifies standard input, textarea, and select elements', () => {
  assert.equal(isEditableElement({ tagName: 'INPUT' }), true);
  assert.equal(isEditableElement({ tagName: 'input' }), true);
  assert.equal(isEditableElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableElement({ tagName: 'SELECT' }), true);
});

test('isEditableElement - Identifies contentEditable elements', () => {
  assert.equal(isEditableElement({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableElement({ tagName: 'P', isContentEditable: false }), false);
});

test('isEditableElement - Identifies ARIA roles (combobox, textbox, searchbox)', () => {
  assert.equal(
    isEditableElement({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'combobox' : null),
    }),
    true,
  );
  assert.equal(
    isEditableElement({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'textbox' : null),
    }),
    true,
  );
  assert.equal(
    isEditableElement({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'searchbox' : null),
    }),
    true,
  );
  assert.equal(
    isEditableElement({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'navigation' : null),
    }),
    false,
  );
});
