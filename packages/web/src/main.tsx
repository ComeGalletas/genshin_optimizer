/**
 * The app's root: game-agnostic top-level types (`game/types.ts`) plus the
 * `labels.ts`/`main.tsx`/`index.css` entry point that mounts the React tree.
 * @packageDocumentation
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
