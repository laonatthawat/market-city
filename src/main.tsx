import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadModelOverrides } from './scene/assets';
import { installSoundBridge } from './store/soundBridge';
import './index.css';

installSoundBridge();
void loadModelOverrides();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
