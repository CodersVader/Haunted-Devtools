import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactCursedApp } from './ReactCursedApp';
import './styles.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) throw new Error('React Cursed App could not find its root.');

createRoot(rootElement).render(
  <StrictMode>
    <ReactCursedApp />
  </StrictMode>,
);
