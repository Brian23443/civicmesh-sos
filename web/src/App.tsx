import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOfflineStatus } from './offline/useOfflineStatus';
import { FileText, HelpCircle, Moon, Sun, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { installVoiceLifecycle, say, stopSpeaking, unlockAudio, voiceDebugEnabled } from './voice/speech';
import { isVoiceEnabled, setVoiceEnabled, useVoiceEnabled } from './voice/voiceSetting';
import { CrossIcon } from './components/CrossIcon';
import logoMark from './assets/logo-mark.png';
import { Odometer } from './components/Odometer';
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
  const [, setGpsLabel] = useState('No GPS fix');
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
      setModelState('error'); setModelMessage('The on-device model could not start — the phone may be low on memory. Close RescuNote from the app switcher and reopen it, or fill in every field manually.');
      setModelError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  }, []);
  const loaded = useRef<{ dispose: () => Promise<void> } | null>(null);
  // Keep the model alive across Send → relay → back. iOS doesn't return a WASM model's memory when the
  // page reloads (the Home Screen app is one long-lived process), so every reload costs ~35 MB until a
  // load fails. The relay's "Back to CivicMesh" link goes *back* (history), and iOS restores this page from
  // its back/forward cache with the model still loaded — so nothing is released on pagehide.
  useEffect(() => { if (!suppliedClassifier) void loadModel(); }, [suppliedClassifier, loadModel]);
  // §12: ask the browser to keep the offline copy (iOS can otherwise evict it).
  useEffect(() => { try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* unsupported */ } }, []);
  const offline=useOfflineStatus();
  // The home screen is exactly one screen tall (the message box flexes to fit), so it never scrolls.
  // No html/body overflow lock: home stays in the same scrolling mode as every other screen, so iOS
  // places the tab bar identically everywhere.
  const isHome = location.pathname === '/';
  const voiceOn = useVoiceEnabled();
  // Hidden layout diagnostics: tap the tagline 5 times (works inside the Home Screen app, where
  // URL flags can't be passed). Shows the build and what iOS reports about the viewport.
  const [diag, setDiag] = useState('');
  const tagTaps = useRef<number[]>([]);
  const onTagTap = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = Date.now(); tagTaps.current = [...tagTaps.current.filter(t => now - t < 2500), now];
    if (tagTaps.current.length < 5) return;
    tagTaps.current = [];
    if (diag) { setDiag(''); return; }
    const probe = (css: string) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;width:1px;visibility:hidden;${css}`; document.body.append(d); const r = d.getBoundingClientRect(); d.remove(); return r; };
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    const vv = window.visualViewport;
    setDiag([`build ${__BUILD_TIME__}  standalone ${(navigator as unknown as { standalone?: boolean }).standalone}`,
      `screen ${screen.width}x${screen.height}  inner ${window.innerWidth}x${window.innerHeight}  client ${document.documentElement.clientHeight}`,
      `vv ${Math.round(vv?.height ?? 0)} top ${Math.round(vv?.offsetTop ?? 0)}  scrollY ${window.scrollY}`,
      `fixed inset0 ${Math.round(probe('top:0;bottom:0').height)}  100dvh ${Math.round(probe('top:0;height:100dvh').height)}  100lvh ${Math.round(probe('top:0;height:100lvh').height)}`,
      `safe top ${Math.round(probe('top:0;height:env(safe-area-inset-top)').height)} bottom ${Math.round(probe('top:0;height:env(safe-area-inset-bottom)').height)}`,
      `nav bottom ${Math.round(nav?.bottom ?? 0)}`].join('\n'));
  };
  useEffect(() => installVoiceLifecycle(isVoiceEnabled), []);
  const [voiceLog, setVoiceLog] = useState<string[]>([]);
  useEffect(() => {
    if (!voiceDebugEnabled) return;
    const on = (e: Event) => setVoiceLog(l => [...l.slice(-7), (e as CustomEvent<string>).detail]);
    window.addEventListener('voicedebug', on); return () => window.removeEventListener('voicedebug', on);
  }, []);
  // Turning voice on is a tap, so it also unlocks audio for later playback on iOS.
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceEnabled(next);
    if (next) { unlockAudio(); void say(['welcome']); } else stopSpeaking();
  };
  // iOS scrolls the page up to keep the message box above the keyboard and doesn't always scroll back
  // when the keyboard closes, leaving the home screen (and its tab bar) shifted. Home never scrolls,
  // so once the keyboard is gone, put it back at the top.
  useEffect(() => {
    if (!isHome) return;
    const vv = window.visualViewport;
    const timers: number[] = [];
    const resetSoon = () => { for (const ms of [60, 350]) timers.push(window.setTimeout(() => { if (window.scrollY !== 0) window.scrollTo(0, 0); }, ms)); };
    const onResize = () => { if (vv && vv.height >= window.innerHeight * 0.9) resetSoon(); };
    document.addEventListener('focusout', resetSoon);
    vv?.addEventListener('resize', onResize);
    return () => { document.removeEventListener('focusout', resetSoon); vv?.removeEventListener('resize', onResize); timers.forEach(clearTimeout); };
  }, [isHome]);
  useEffect(() => {
    const titles: Record<string,string> = { '/':'Get help', '/analyze':'Reading your message', '/review':'Check and send', '/send':'Sent', '/reports':'My reports' };
    document.title = `${titles[location.pathname] ?? 'RescuNote'} · RescuNote`;
    if (first.current) { first.current = false; return; } main.current?.focus();
  }, [location.pathname]);
  return <>
    <a className="skip-link" href="#main" onClick={event=>{event.preventDefault();main.current?.focus();}}>Skip to main content</a>
    <div className={`app-shell ${isHome?'is-home':''}`}>
      {/* Big, centred brand with the odometer name on the home screen; compact elsewhere. */}
      <header className={`hero ${location.pathname==='/'?'':'hero--compact'}`}>
        <Button className="help-toggle" aria-label="Open RescuNote information" onClick={() => setHelp(true)}><HelpCircle aria-hidden="true" size={20}/></Button>
        <Button className="voice-toggle" aria-pressed={voiceOn} aria-label={voiceOn ? 'Turn off voice guidance' : 'Turn on voice guidance'}
          title={voiceOn ? 'Voice guidance on' : 'Voice guidance off'} onClick={toggleVoice}>{voiceOn ? <Volume2 aria-hidden="true" size={20}/> : <VolumeX aria-hidden="true" size={20}/>}</Button>
        <Button className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>{theme === 'dark' ? <Sun aria-hidden="true" size={20}/> : <Moon aria-hidden="true" size={20}/>}</Button>
        <NavLink to="/" aria-label="RescuNote home" className="hero-brand">
          <span aria-hidden="true" className="brand-logo hero-logo" style={{ maskImage:`url(${logoMark})`, WebkitMaskImage:`url(${logoMark})` }}/>
          <Odometer text="RescuNote" className="hero-name"/>
          <span className="hero-tag" onClick={onTagTap}>Offline emergency reporting</span>
        </NavLink>
      </header>
      <div className="status-row">
        {/* Quiet when all is well: offline status always, the model only while it isn't ready.
            Location status sits under the Send button. */}
        <Status><WifiOff aria-hidden="true" size={16}/>{offline.state==='ready'?'Ready offline ✓':offline.state==='development'?'Offline available in production preview':offline.state==='unavailable'?'Offline copy unavailable':'Saving for offline use…'}</Status>
        {!modelActive && <Status>{suppliedClassifier?'Test classifier':modelState==='error'?'Message reading unavailable · choose from a list':'Loading on-device reading…'}</Status>}
      </div>
      {/* Only a failure gets a block; while loading, the status pills say so (and the hero stays clean). */}
      {!suppliedClassifier && location.pathname==='/' && modelState==='error' && <div className="notice">
        {modelMessage && <p role="alert">{modelMessage}</p>}
        {modelState==='error' && modelError && <p className="small">Details: {modelError}</p>}
        {/* Retry with a fresh page: an in-page retry would load a second model on top of the first. */}
        {modelState==='error' && <Button onClick={() => window.location.reload()}>Retry model loading</Button>}
      </div>}
      <main id="main" ref={main} tabIndex={-1}>
        <ReportFlow classifier={classifier} store={store} relayNavigate={relayNavigate} onGpsStatus={setGpsLabel} analysisReady={!!suppliedClassifier||modelActive}/>

      </main>
      {diag && <pre className="voice-debug" aria-hidden="true">{diag}</pre>}
      {voiceDebugEnabled && <pre className="voice-debug" aria-hidden="true">{voiceLog.join('\n') || 'voice debug'}</pre>}
      <nav aria-label="Main navigation" className="bottom-nav"><NavLink to="/" end><CrossIcon size={20}/>Get help</NavLink><NavLink to="/reports"><FileText aria-hidden="true" size={20}/>My reports</NavLink></nav>
    </div>
    <Sheet open={help} onClose={() => setHelp(false)} title="About RescuNote" variant="center">
      <p>RescuNote sends short emergency reports by radio through a nearby relay. No cell service or internet needed.</p>
      <p><strong>Private:</strong> your message is read on this phone. Only an 18-byte summary of the details is sent, never your words.</p>
      <p><strong>Get ready:</strong> open RescuNote once while online and wait for “Ready offline ✓”. If you add it to your Home Screen, open it from there once online too.</p>
      <p><strong>To send:</strong> Airplane Mode on, Wi-Fi on, join “RescuNote”.</p>
      {offline.missingInference.length>0&&<p>Some model files are missing from this build; you can still choose details from a list.</p>}
      <Button className="primary full-width mt-4" onClick={() => setHelp(false)}>Got it</Button>
      <a className="privacy-link" href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
    </Sheet>
  </>;
}
