import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useGlobalShortcuts } from '../ui/shortcuts';

function ShortcutsHost({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return <>{children}</>;
}

/** Renders `ui` with the app's global keyboard listener mounted (as App does). */
export const renderWithShortcuts = (ui: ReactNode) => render(<ShortcutsHost>{ui}</ShortcutsHost>);
