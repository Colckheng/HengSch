import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/700.css';
import { App } from './App';
import './paper-lab.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
