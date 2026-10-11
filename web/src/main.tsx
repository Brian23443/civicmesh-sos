import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import './styles.css';
import { App } from './App';

/**
 * iOS Home Screen app (no Safari toolbars): mark it so the CSS can size to the real screen. There,
 * iOS can report the page 62 pt (status bar) short — inner/dvh/fixed all 812 on an 874 pt screen,
 * measured in the iOS Simulator — leaving the bottom tab bar floating. 100lvh stays the true screen.
 */
if ((navigator as unknown as { standalone?: boolean }).standalone === true
  || window.matchMedia?.('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
}
import { ThemeProvider } from './components/ThemeProvider';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><ThemeProvider><App/></ThemeProvider></HashRouter></React.StrictMode>);
