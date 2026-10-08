'use client'

import { useEffect, useRef, useState, useCallback } from 'react';

export interface UseSaveShortcutOptions {
  onSave?: () => void | Promise<void>;
  isSaving?: boolean;
  isSubmitting?: boolean;
  enabled?: boolean;
}

interface UseSaveShortcutReturn {
  idempotencyKey: string;
  resetIdempotencyKey: () => string;
}

/**
 * Shared keyboard shortcut hook for saving forms:
 * - Ctrl+S / Cmd+S and Ctrl+Enter
 * - Always calls preventDefault() to prevent browser "Save Page" dialog
 * - Enforces in-flight locking: duplicate keypresses while isSaving=true are discarded
 * - Manages UUID idempotency_key for safe double-submit prevention
 */
export function useSaveShortcut(
  optionsOrHandler: UseSaveShortcutOptions | (() => void | Promise<void>),
  enabledArg?: boolean,
): UseSaveShortcutReturn {
  let onSave: () => void | Promise<void> = () => {};
  let isSaving = false;
  let enabled = true;

  if (typeof optionsOrHandler === 'function') {
    onSave = optionsOrHandler;
    if (enabledArg !== undefined) {
      enabled = enabledArg;
    }
  } else if (optionsOrHandler) {
    onSave = optionsOrHandler.onSave || (() => {});
    isSaving = !!(optionsOrHandler.isSaving || optionsOrHandler.isSubmitting);
    enabled = optionsOrHandler.enabled !== undefined ? optionsOrHandler.enabled : true;
  }
  // Generate initial UUID for idempotency
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  });

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const resetIdempotencyKey = useCallback(() => {
    const nextKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setIdempotencyKey(nextKey);
    return nextKey;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+S, Cmd+S, or Ctrl+Enter
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      const isSaveKey =
        (isCtrlOrCmd && (event.key === 's' || event.key === 'S')) ||
        (isCtrlOrCmd && event.key === 'Enter');

      if (!isSaveKey) return;

      // Crucial: always prevent browser 'Save page' dialog or form default
      event.preventDefault();
      event.stopPropagation();

      // In-flight lock: discard if already saving or shortcut disabled
      if (!enabledRef.current || isSavingRef.current) {
        return;
      }

      onSaveRef.current();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return {
    idempotencyKey,
    resetIdempotencyKey,
  };
}
