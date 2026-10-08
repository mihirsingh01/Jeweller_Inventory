'use client';

import { useEffect } from 'react';

interface ShortcutOptions {
  code: 'KeyC' | 'KeyS' | 'KeyK';
  onTrigger: () => void;
  enabled?: boolean;
  isDialogOpen?: boolean;
}

/**
 * Shared keyboard shortcut hook for Alt+C, Alt+S, Alt+K:
 * - Matches event.code (KeyC, KeyS, KeyK) because macOS Option+key types special characters
 * - Calls e.preventDefault() so browser menus (e.g. Firefox Alt+S History) do not intercept
 * - Active even while focus is inside inputs
 * - Disabled when any dialog is already open
 */
export function useAltKeyShortcut({
  code,
  onTrigger,
  enabled = true,
  isDialogOpen = false,
}: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check Alt key (Option key on macOS)
      if (e.altKey && e.code === code && !e.ctrlKey && !e.metaKey) {
        if (isDialogOpen) {
          return; // Do nothing if a dialog is already open
        }
        e.preventDefault();
        e.stopPropagation();
        onTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [code, onTrigger, enabled, isDialogOpen]);
}
