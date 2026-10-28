import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor } from './state/store';
import { App } from './ui/App';

if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
