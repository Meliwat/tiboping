import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const appName = 'TiboPing';

const root = document.querySelector<HTMLDivElement>('#root');

if (!root) {
  throw new Error('TiboPing root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>{appName}</h1>
      <p>The signal desk is being assembled.</p>
    </main>
  </StrictMode>,
);
