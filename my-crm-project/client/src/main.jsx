import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { applyGold, cachedTheme } from './theme.js';

applyGold(cachedTheme().goldHex);

createRoot(document.getElementById('root')).render(<App />);
