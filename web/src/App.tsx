import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOfflineStatus } from './offline/useOfflineStatus';
import { FileText, HelpCircle, Moon, Shield, Sun, WifiOff } from 'lucide-react';
import { useTheme } from './components/ThemeProvider';
import { Button, Sheet, Status } from './components/ui';
import { ReportFlow } from './flow/ReportFlow';
import type { Classifier } from './inference/types';
import { reportStore, navigateToRelay, type ReportStore } from './lib/reports';
const unavailableClassifier: Classifier = { async classify() { throw Error('Local model is not ready'); } };
interface AppProps { classifier?: Classifier; store?: ReportStore; relayNavigate?: (hex: string) => void }

export function App({ classifier: suppliedClassifier, store = reportStore, relayNavigate = navigateToRelay }: AppProps = {}) {
  const { theme, toggle } = useTheme(); const location = useLocation();
  const main = useRef<HTMLElement>(null); const first = useRef(true);
  const [gpsLabel, setGpsLabel] = useState('No GPS fix');
  const [help, setHelp] = useState(false);
  const [local, setLocal] = useState<Classifier | null>(null);
  const [modelState, setModelState] = useState<'idle'|'loading'|'ready'|'error'>(suppliedClassifier?'idle':'loading');
  const [modelMessage, setModelMessage] = useState('');
  const [modelError, setModelError] = useState('');
  const classifier = suppliedClassifier ?? local ?? unavailableClassifier;
  const modelActive = !suppliedClassifier && !!local;
  const loadModel = useCallback(async () => {
    setModelState('loading'); setModelMessage('Preparing emergency mode…');
    try {
      const { loadLocalModel } = await import('./inference/loadModel');
      const model = await loadLocalModel(setModelMessage);
      loaded.current = model;
      setLocal(model.classifier); setModelState('ready'); setModelMessage(''); setModelError('');
    } catch (error) {
      setModelState('error'); setModelMessage('The on-device model could not start — the phone may be low on memory. Close CivicMesh from the app switcher and reopen it, or fill in every field manually.');
      setModelError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  }, []);
  const loaded = useRef<{ dispose: () => Promise<void> } | null>(null);
  // Keep the model alive across Send → relay → back. iOS doesn't return a WASM model's memory when the
  // page reloads (the Home Screen app is one long-lived process), so every reload costs ~35 MB until a
  // load fails. The relay's "Back to CivicMesh" goes *back* (history), and iOS restores this page from
  // its back/forward cache with the model still loaded — so nothing is released on pagehide.
  useEffect(() => { if (!suppliedClassifier) void loadModel(); }, [suppliedClassifier, loadModel]);
  // §12: ask the browser to keep the offline copy (iOS can otherwise evict it).
  useEffect(() => { try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* unsupported */ } }, []);
  const offline=useOfflineStatus();
  useEffect(() => {
    const titles: Record<string,string> = { '/':'Report', '/analyze':'Analyze', '/review':'Review', '/send':'Send', '/reports':'My reports' };
    document.title = `${titles[location.pathname] ?? 'CivicMesh'} · CivicMesh-SOS`;
    if (first.current) { first.current = false; return; } main.current?.focus();
  }, [location.pathname]);
  return <>
    <a className="skip-link" href="#main" onClick={event=>{event.preventDefault();main.current?.focus();}}>Skip to main content</a>
    <div className="app-shell">
      <header className="flex items-center justify-between gap-3">
        <NavLink to="/" aria-label="CivicMesh home" className="brand"><Shield aria-hidden="true" size={30}/><span>CivicMesh<span className="brand-sub">SOS / SURVIVOR</span></span></NavLink>
        <Button aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>{theme === 'dark' ? <Sun aria-hidden="true" size={22}/> : <Moon aria-hidden="true" size={22}/>}</Button>
      </header>
      <div className="flex flex-wrap gap-2 my-6">
        <Status><WifiOff aria-hidden="true" size={16}/>{offline.state==='ready'?(modelActive?'Ready offline ✓':'Ready offline ✓ · Manual available'):offline.state==='development'?'Offline available in production preview':offline.state==='unavailable'?'Offline cache unavailable':'Preparing offline cache…'}</Status>
        <Status>{modelActive?'Model ready':suppliedClassifier?'Test classifier':modelState==='error'?'Model unavailable':'Loading local model…'}</Status><Status>{gpsLabel}</Status>
      </div>
      {!suppliedClassifier && location.pathname==='/' && (modelMessage || modelState==='error') && <div className="notice">
        {modelMessage && <p role={modelState==='error'?'alert':'status'}>{modelMessage}</p>}
        {modelState==='error' && modelError && <p className="small">Details: {modelError}</p>}
        {/* Retry with a fresh page: an in-page retry would load a second model on top of the first. */}
        {modelState==='error' && <Button onClick={() => window.location.reload()}>Retry model loading</Button>}
      </div>}
      <main id="main" ref={main} tabIndex={-1}>
        <ReportFlow classifier={classifier} store={store} relayNavigate={relayNavigate} onGpsStatus={setGpsLabel} analysisReady={!!suppliedClassifier||modelActive}/>

      </main>
      <footer className="flex items-center justify-between gap-3 mt-8"><span>On your device. In your control.</span><Button aria-label="Open CivicMesh information" onClick={() => setHelp(true)}><HelpCircle aria-hidden="true" size={22}/></Button></footer>
      <nav aria-label="Main navigation" className="bottom-nav"><NavLink to="/" end><Shield aria-hidden="true" size={20}/>Report</NavLink><NavLink to="/reports"><FileText aria-hidden="true" size={20}/>My reports</NavLink></nav>
    </div>
    <Sheet open={help} onClose={() => setHelp(false)} title="About CivicMesh"><p>CivicMesh sends structured emergency reports through a nearby relay.</p><p>Your message is analyzed on this phone by a small triage model; the text itself is never sent — only an 18-byte summary you confirm. Check every suggested field before sending. The relay reply confirms radio handoff; this app does not confirm rescue delivery.</p><p>For Airplane Mode, load the website once while online and wait for “Ready offline ✓”. Manual reports remain available if the model cannot start.</p>{offline.missingInference.length>0&&<p>Some model files are missing from this build; manual reports still work.</p>}<p>On iPhone, Add to Home Screen helps iOS keep the app. <strong>The Home Screen app keeps its own separate copy:</strong> open it from the Home Screen once while online and wait for “Ready offline ✓” before relying on it offline.</p><Button className="primary mt-6" onClick={() => setHelp(false)}>Got it</Button></Sheet>
  </>;
}
