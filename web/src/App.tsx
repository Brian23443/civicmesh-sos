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
  const [experimental, setExperimental] = useState<Classifier | null>(null);
  const [modelState, setModelState] = useState<'idle'|'loading'|'ready'|'error'>(suppliedClassifier?'idle':'loading');
  const [modelMessage, setModelMessage] = useState('');
  const classifier = suppliedClassifier ?? experimental ?? unavailableClassifier;
  const experimentalActive = !suppliedClassifier && !!experimental;
  const loadModel = useCallback(async () => {
    setModelState('loading'); setModelMessage('Loading experimental model…');
    try {
      const { loadExperimentalClassifier } = await import('./inference/experimentalClassifier');
      const model = await loadExperimentalClassifier(setModelMessage);
      setExperimental(model); setModelState('ready'); setModelMessage('');
    } catch { setModelState('error'); setModelMessage('Model loading failed. Retry or fill in manually.'); }
  }, []);
  useEffect(() => { if (!suppliedClassifier) void loadModel(); }, [suppliedClassifier, loadModel]);
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
        <Status><WifiOff aria-hidden="true" size={16}/>{offline.state==='ready'?(experimentalActive?'Ready offline ✓ · Experimental model':'Ready offline ✓ · Manual available'):offline.state==='development'?'Offline available in production preview':offline.state==='unavailable'?'Offline cache unavailable':'Preparing offline cache…'}</Status>
        <Status>{experimentalActive?'Experimental MiniLM ready':suppliedClassifier?'Test classifier':modelState==='error'?'Model unavailable':'Loading local model…'}</Status><Status>{gpsLabel}</Status>
      </div>
      {!suppliedClassifier && location.pathname==='/' && <div className="notice">
        <p>Experimental English model — check every suggestion. It has not been validated against T1.</p>
        {modelState==='error' && <Button onClick={loadModel}>Retry model loading</Button>}
        {modelMessage && <p role={modelState==='error'?'alert':'status'}>{modelMessage}</p>}
      </div>}
      <main id="main" ref={main} tabIndex={-1}>
        <ReportFlow classifier={classifier} store={store} relayNavigate={relayNavigate} onGpsStatus={setGpsLabel} experimental={!suppliedClassifier} analysisReady={!!suppliedClassifier||experimentalActive}/>

      </main>
      <footer className="flex items-center justify-between gap-3 mt-8"><span>On your device. In your control.</span><Button aria-label="Open CivicMesh information" onClick={() => setHelp(true)}><HelpCircle aria-hidden="true" size={22}/></Button></footer>
      <nav aria-label="Main navigation" className="bottom-nav"><NavLink to="/" end><Shield aria-hidden="true" size={20}/>Report</NavLink><NavLink to="/reports"><FileText aria-hidden="true" size={20}/>My reports</NavLink></nav>
    </div>
    <Sheet open={help} onClose={() => setHelp(false)} title="About CivicMesh"><p>CivicMesh sends structured emergency reports through a nearby relay.</p><p>Analysis uses Stage1Classifier with an experimental local MiniLM model through Transformers.js and ONNX. Check every suggested field before sending. The relay reply confirms radio handoff; this app does not confirm rescue delivery.</p><p>For Airplane Mode, load the production website once and wait for “Ready offline ✓”. The local model loads automatically and checks inference on your device. Manual reports remain available if model loading fails.</p>{offline.missingInference.length>0&&<p>T1 model artifacts are still missing. The experimental MiniLM replacement is separate and does not establish T1 parity.</p>}<p>On iPhone, Add to Home Screen can help retain the app. Offline readiness depends on the browser keeping its cached data.</p><Button className="primary mt-6" onClick={() => setHelp(false)}>Got it</Button></Sheet>
  </>;
}
