import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { loadSettings } from './core/settings/settings';
import '@fontsource/press-start-2p/latin-400.css';
import './styles/global.css';

// Settings are tiny; loading them before first render keeps every reader synchronous.
void loadSettings().then(() => {
  const root = document.getElementById('root');
  if (!root) throw new Error('index.html is missing #root');
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
