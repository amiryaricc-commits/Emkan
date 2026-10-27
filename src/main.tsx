import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ModuleErrorBoundary } from './components/ModuleErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ModuleErrorBoundary moduleName="سامانه جامع امکان">
    <App />
  </ModuleErrorBoundary>
);
