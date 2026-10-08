'use client'

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isEditableElement } from '../utils/dom-guards';

export { isEditableElement };

interface UseBackspaceNavigationGuardOptions {
  isDirty?: boolean;
  isDialogOpen?: boolean;
  onBack?: () => void;
}

/**
 * Shared hook guarding Backspace key navigation:
 * - Fires ONLY when focused element is NOT editable.
 * - Suppressed when a modal dialog or dropdown is open.
 * - Suppressed on root dashboard ('/').
 * - Prompts confirmation if form has unsaved data (isDirty).
 */
export function useBackspaceNavigationGuard(
  optionsOrDialogOpen: UseBackspaceNavigationGuardOptions | boolean = {},
) {
  const options =
    typeof optionsOrDialogOpen === 'boolean'
      ? { isDialogOpen: optionsOrDialogOpen }
      : optionsOrDialogOpen;

  const { isDirty = false, isDialogOpen = false, onBack } = options;
  const pathname = usePathname();
  const router = useRouter();

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const isDialogOpenRef = useRef(isDialogOpen);
  isDialogOpenRef.current = isDialogOpen;

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return;

      // 1. Guard against firing on editable elements
      if (isEditableElement(document.activeElement)) {
        return;
      }

      // 2. Guard: Never trigger on root dashboard
      if (pathname === '/') {
        return;
      }

      // 3. Guard: Never trigger when a modal dialog or dropdown is open
      if (isDialogOpenRef.current) {
        return;
      }

      // Prevent browser default back navigation immediately
      event.preventDefault();

      // 4. Dirty confirmation
      if (isDirtyRef.current) {
        const confirmed = window.confirm(
          'You have unsaved changes. Discard and go back?',
        );
        if (!confirmed) {
          return;
        }
      }

      // Execute custom back callback or router.back()
      if (onBackRef.current) {
        onBackRef.current();
      } else {
        router.back();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, router]);
}
