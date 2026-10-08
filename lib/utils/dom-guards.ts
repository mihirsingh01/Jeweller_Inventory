/**
 * Checks whether an element is an editable input/field where Backspace
 * should delete characters normally rather than navigating backwards.
 */
export function isEditableElement(element: any): boolean {
  if (!element) return false;

  const tagName = (element.tagName || '').toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (element.isContentEditable === true) {
    return true;
  }

  const role = typeof element.getAttribute === 'function' ? element.getAttribute('role') : null;
  if (role === 'combobox' || role === 'textbox' || role === 'searchbox') {
    return true;
  }

  return false;
}
