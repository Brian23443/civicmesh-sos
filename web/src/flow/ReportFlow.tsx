import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, X, FileText, ListChecks, LoaderCircle, MapPin, Minus, Plus, Send, Wifi } from 'lucide-react';
import type { Classifier } from '../inference/types';
import { resolveReport } from '../resolvers';
import { finalizeReport } from '../inference/finalize';
import { gpsBucket, GpsAccuracy } from '../protocol/enums';
import { acquireGps, gpsLabel, type GpsUpdate } from '../lib/gps';
import type { FrameFields } from '../protocol/types';
import { pack, unpackFrame } from '../protocol/packer';
import { fromHex } from '../protocol/hex';
import { Button, Sheet, Status } from '../components/ui';
import { hazardIcons, hazardLabels, locationLabels, medicalLabels, medicalIcons, priorityLabels, statusLabels } from '../lib/presentation';
import { RELAY_URL, type ReportStore, type SentReport } from '../lib/reports';

type Draft = Pick<FrameFields,'priority'|'hazard'|'status'|'adults'|'children'|'medicalFlags'|'thirdParty'|'locationType'> & { locationText: string | null; mode:'model'|'manual' };
type Gps = { lat:number; lon:number; accuracy:number | null; bucket:FrameFields['gpsAccuracy']; state:'idle'|'loading'|'ready'|'failed' };
const NO_GPS: Gps = { lat:0,lon:0,accuracy:null,bucket:GpsAccuracy.NO_FIX,state:'idle' };
const MANUAL: Draft = { priority:1,hazard:0,status:3,adults:1,children:0,medicalFlags:0,thirdParty:false,locationType:0,locationText:null,mode:'manual' };
type Editor = 'priority'|'hazard'|'status'|'people'|'medical'|'location'|null;
interface Props { classifier:Classifier; store:ReportStore; relayNavigate:(hex:string)=>void; onGpsStatus:(status:string)=>void; analysisReady?:boolean }

/** One tap adds a phrase, for someone who is hurt, shaking or panicking and can't type much. */
const QUICK_PHRASES = ['I’m trapped', 'Someone is badly hurt', 'Fire or smoke', 'Water is rising', 'Need medicine', 'Children with me'];

function Stepper({ label, value, onChange }: {label:string;value:number;onChange:(n:number)=>void}) {
  return <div className="stepper"><span>{label}</span><div className="flex items-center gap-3">
    <Button aria-label={`Decrease ${label.toLowerCase()}`} disabled={value===0} onClick={()=>onChange(value-1)}><Minus aria-hidden="true" size={18}/></Button>
    <output aria-label={`${label} count`} aria-live="polite">{value}</output>
    <Button aria-label={`Increase ${label.toLowerCase()}`} disabled={value===15} onClick={()=>onChange(value+1)}><Plus aria-hidden="true" size={18}/></Button>
  </div></div>;
}
function Choice({ selected, onClick, children }: {selected:boolean;onClick:()=>void;children:React.ReactNode}) {
  return <Button className="choice" aria-pressed={selected} onClick={onClick}>{children}</Button>;
}

function Field({ label, value, open, icon, onEdit }: {label:string;value:string;open:Editor;icon?:React.ReactNode;onEdit:(editor:Editor)=>void}) {
    return <Button className="field-row" aria-label={`Edit ${label.toLowerCase()}`} onClick={()=>onEdit(open)}>
      <span className="flex items-center gap-3">{icon}<span><span className="field-label">{label}</span><span>{value}</span></span></span><ChevronRight aria-hidden="true" size={20}/>
    </Button>;
  }

const people = (adults:number, children:number) => {
  const total=adults+children;
  return `${total} ${total===1?'person':'people'}${children?` (${adults} adult${adults===1?'':'s'}, ${children} child${children===1?'':'ren'})`:''}`;
};

/** "RED · Life-threatening · Flood · 2 people" from the 18 bytes that were sent. */
function receiptSummary(receipt: SentReport): string {
  try {
    const f = unpackFrame(fromHex(receipt.hex));
    return `${priorityLabels[f.priority]} · ${hazardLabels[f.hazard]} · ${people(f.adults, f.children)}`;
  } catch { return 'Report saved'; }
}

export function ReportFlow({ classifier, store, relayNavigate, onGpsStatus, analysisReady=true }: Props) {
  const navigate=useNavigate(); const route=useLocation();
  const [message,setMessage]=useState(''); const [draft,setDraft]=useState<Draft|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [receipt,setReceipt]=useState<SentReport|null>(null); const [relayBlocked,setRelayBlocked]=useState(false);
  const [editor,setEditor]=useState<Editor>(null); const [snapshot,setSnapshot]=useState(()=>store.snapshot());
  const analyzeRun=useRef(0); const gpsRun=useRef(0); const sending=useRef(false); const mounted=useRef(true);
  useEffect(()=>{ mounted.current=true; return ()=>{mounted.current=false; analyzeRun.current++;gpsRun.current++;}; },[]);
  useEffect(()=>{
    if(route.pathname!=='/analyze'){analyzeRun.current++;setBusy(false);}
    setError('');
    setEditor(null);
  },[route.pathname]);
  const [gpsUpdate,setGpsUpdate]=useState<GpsUpdate|null>(null);
  const cancelGps=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>cancelGps.current?.(),[]);
  // Best fix so far (even mid-search), so a report sent early still carries a usable position.
  const fix=gpsUpdate?.fix ?? null;
  const gps:Gps = fix
    ? {lat:fix.lat,lon:fix.lon,accuracy:fix.accuracy,bucket:gpsBucket(fix.accuracy),state:gpsUpdate!.phase==='searching'?'loading':'ready'}
    : {...NO_GPS,state:gpsUpdate?.phase==='searching'?'loading':gpsUpdate?'failed':'idle'};
  const gpsText=gpsLabel(gpsUpdate);
  useEffect(()=>onGpsStatus(gpsText),[gpsText,onGpsStatus]);
  const requestGps=useCallback(()=>{
    cancelGps.current?.();
    const run=++gpsRun.current;
    cancelGps.current=acquireGps(navigator.geolocation,update=>{if(mounted.current && run===gpsRun.current) setGpsUpdate(update);});
  },[]);
  // Location starts by itself: someone in crisis shouldn't have to find a button, and a cold GPS
  // start can take a minute — by the time they've typed, the fix is usually there.
  useEffect(()=>{ requestGps(); },[requestGps]);
  const retryGpsIfStopped=()=>{ if(!gpsUpdate || ['timeout','unavailable'].includes(gpsUpdate.phase)) requestGps(); };

  function patch(fields: Partial<Draft>) { setDraft(current=>current ? {...current,...fields}:current); }
  function addPhrase(phrase:string) {
    setMessage(current=>{ const t=current.trim(); return t ? `${t.replace(/[.!]?$/,'.')} ${phrase}.` : `${phrase}.`; });
  }
  async function analyze() {
    if(busy||!analysisReady||!message.trim()) return;
    retryGpsIfStopped();
    const run=++analyzeRun.current; const text=message; setDraft(null);setBusy(true);setError('');setReceipt(null);navigate('/analyze');
    try {
      const result=await classifier.classify(text);
      if(!mounted.current||run!==analyzeRun.current) return;
      // Model + §5.4 resolvers, combined exactly like Python's to_slots (finalize.ts).
      setDraft({...finalizeReport(result,resolveReport(text),classifier.settings),mode:'model'});
      navigate('/review');
    } catch {if(mounted.current && run===analyzeRun.current) setError('Couldn’t read the message on this phone. Choose the details from a list instead.');}
    finally {if(mounted.current && run===analyzeRun.current) setBusy(false);}
  }
  function manual() {
    analyzeRun.current++;setBusy(false);setError('');setReceipt(null);retryGpsIfStopped();
    const fields=resolveReport(message);
    setDraft({...MANUAL,adults:fields.adults,children:fields.children,medicalFlags:fields.medicalFlags,
      thirdParty:fields.suggestedThirdParty,locationType:fields.location.type,locationText:fields.location.text}); navigate('/review');
  }
  /** The frame as it would go out now — the newest GPS fix and timestamp at the moment of Send. */
  function packet():FrameFields {
    if(!draft) throw Error('No report');
    const identity=store.snapshot();
    return {priority:draft.priority,hazard:draft.hazard,status:draft.status,adults:draft.adults,children:draft.children,
      medicalFlags:draft.medicalFlags,thirdParty:draft.thirdParty,locationType:draft.locationType,
      lat:gps.bucket===0?0:gps.lat,lon:gps.bucket===0?0:gps.lon,gpsAccuracy:gps.bucket,
      timestamp:Math.floor(Date.now()/1000),deviceId:identity.deviceId,seq:identity.seq};
  }
  function send() {
    if(!draft || sending.current) return;
    sending.current=true;setError('');
    let report:SentReport;
    // Straight back to a fresh home screen: the relay shows "Report sent" for 10 s, then returns here
    // (history.back, model still loaded). A small banner keeps the retry link in case the relay page
    // never loaded — e.g. the phone wasn't on the RescuNote Wi-Fi.
    try {report=store.handoff(packet());setSnapshot(store.snapshot());setReceipt(report);setRelayBlocked(false);setDraft(null);setMessage('');navigate('/');}
    catch(e){sending.current=false;setError(e instanceof Error?e.message:'Could not prepare the report. Check the details and try again.');return;}
    sending.current=false;
    // Everything required to survive navigation is committed before this call.
    try {relayNavigate(report.hex);} catch {setRelayBlocked(true);}
  }
  const titles={priority:'How urgent is it?',hazard:'What kind of emergency?',status:'What’s your situation?',people:'How many people?',medical:'Medical needs',location:'Location'};
  let preview=''; if(draft) {try {preview=pack(packet());}catch {/* Send validation supplies the actionable message. */}}
  const HazardIcon=hazardIcons[draft?.hazard??0];
  const storageNote=!store.persistent ? <p role="status" className="notice">Storage is unavailable. Reports stay in memory for this session; sending still works.</p>:null;
  const gpsWaiting=gps.bucket===0 && gps.state==='loading';
  const gpsLine=<p className="gps-line" aria-live="polite"><MapPin aria-hidden="true" size={18}/><span>{gps.bucket===0
    ? (gps.state==='loading'?'Finding your location…':gpsText)
    : `Location found · ±${Math.ceil(gps.accuracy!)} m`}</span>
    {gps.state==='failed'&&gpsUpdate?.phase!=='denied'&&gpsUpdate?.phase!=='unsupported'&&<Button className="small-button" onClick={requestGps}>Try again</Button>}</p>;
  return <>
    <Routes>
      <Route path="/" element={<section className="home">
        {receipt&&<div className="sent-banner" role="status"><CheckCircle2 aria-hidden="true" size={24}/><div>
          <strong>{relayBlocked?'Report saved — the relay didn’t open':'Report handed to the relay'}</strong>
          <span>{receiptSummary(receipt)}</span>
          <a href={RELAY_URL+receipt.hex}>Didn’t see “Report sent”? Send again (same report)</a>
        </div><Button aria-label="Dismiss" className="banner-close" onClick={()=>setReceipt(null)}><X aria-hidden="true" size={18}/></Button></div>}
        <h1>{receipt?'Anything else?':'What’s happening?'}</h1>
        <form className="report-form" onSubmit={e=>{e.preventDefault();void analyze();}}>
          <label htmlFor="message" className="sr-only">What’s happening? Who needs help?</label>
          <textarea id="message" value={message} onChange={e=>setMessage(e.target.value)} disabled={busy} rows={4} placeholder="Who needs help, and what’s wrong? e.g. Water is rising, 3 of us on the roof, my dad needs insulin."/>
          <div className="quick-phrases" role="group" aria-label="Tap to add">
            {QUICK_PHRASES.map(phrase=><Button key={phrase} className="phrase" disabled={busy} onClick={()=>addPhrase(phrase)}><Plus aria-hidden="true" size={16}/>{phrase}</Button>)}
          </div>
          <Button type="submit" className="primary full-width send-button" disabled={busy||!analysisReady||!message.trim()} aria-busy={busy}>{busy?<><LoaderCircle className="spinner" aria-hidden="true" size={22}/>Reading your message…</>:<><Send aria-hidden="true" size={22}/>Send for help</>}</Button>
          {gpsLine}
        </form>
        {error&&<p role="alert" className="notice">{error}</p>}
        <Button className="full-width mt-4" onClick={manual}><ListChecks aria-hidden="true" size={20}/>Can’t type? Choose from a list</Button>
        <Link className="home-reports" to="/reports"><FileText aria-hidden="true" size={18}/>My reports{snapshot.reports.length?` (${snapshot.reports.length})`:''}</Link>
        {storageNote}
      </section>}/>
      <Route path="/analyze" element={busy||error?<section aria-busy={busy}>
        <h1>{busy?'Reading your message':'Couldn’t read the message'}</h1>
        {busy?<div className="card mt-6" role="status" aria-live="polite"><LoaderCircle className="spinner" aria-hidden="true" size={32}/><h2>Reading your message…</h2><p>This happens on your phone and takes a second. Nothing is sent yet.</p></div>:<p role="alert" className="notice">{error}</p>}
        <Button className="full-width mt-6" onClick={manual}><ListChecks aria-hidden="true" size={20}/>Choose from a list</Button>
        <Link to="/" className="text-link"><ArrowLeft aria-hidden="true" size={18}/>Back to your message</Link>
      </section>:<Navigate to={draft?'/review':'/'} replace/>}/>
      <Route path="/review" element={draft?<section><p className="eyebrow">CHECK, THEN SEND</p><h1>Ready to send</h1>
        <p>{draft.mode==='model'?'We filled this in from your message. Tap anything that’s wrong.':'Tap each item to set it.'}</p>
        <Button className={`triage triage-${draft.priority}`} aria-label="Edit priority" onClick={()=>setEditor('priority')}><span>{priorityLabels[draft.priority]}</span><ChevronRight aria-hidden="true"/></Button>
        <div className="review-fields mt-4"><Field onEdit={setEditor} label="Emergency" value={hazardLabels[draft.hazard]} open="hazard" icon={<HazardIcon aria-hidden="true" size={24}/>}/>
          <Field onEdit={setEditor} label="Situation" value={statusLabels[draft.status]} open="status"/>
          <Field onEdit={setEditor} label="People" value={people(draft.adults,draft.children)} open="people"/>
          <Field onEdit={setEditor} label="Medical needs" value={medicalLabels.filter((_,i)=>draft.medicalFlags&(1<<i)).join(', ')||'None'} open="medical"/>
          <Field onEdit={setEditor} label="Location" value={[gps.bucket===0?(gpsWaiting?'Finding your location…':'No GPS location'):`GPS ±${Math.ceil(gps.accuracy!)} m`,
            draft.locationType?locationLabels[draft.locationType]:null].filter(Boolean).join(' · ')} open="location" icon={<MapPin aria-hidden="true" size={24}/>}/></div>
        <fieldset className="here-toggle mt-4"><legend>Are you at the emergency?</legend><div className="segmented">
          <Choice selected={!draft.thirdParty} onClick={()=>patch({thirdParty:false})}>Yes, I’m here</Choice>
          <Choice selected={draft.thirdParty} onClick={()=>patch({thirdParty:true})}>No, it’s someone else</Choice></div>
          {draft.locationText&&<p className="small">You mentioned “{draft.locationText}”. Your phone’s GPS shows where <em>you</em> are.</p>}
        </fieldset>
        <div className="wifi-hint mt-4"><Wifi aria-hidden="true" size={22}/><p><strong>To send:</strong> keep Airplane Mode on, turn on Wi-Fi, and join <strong>RescuNote</strong>.</p></div>
        {error&&<p role="alert" className="notice">{error}</p>}{storageNote}
        <Button className="primary full-width send-button mt-4" onClick={send}><Send aria-hidden="true" size={22}/>{gpsWaiting?'Send now (location still loading)':'Send'}</Button>
        <Link to="/" className="text-link"><ArrowLeft aria-hidden="true" size={18}/>Back to your message</Link>
        <details className="tech-details"><summary>What gets sent (18 bytes)</summary><code className="hex">{preview}</code><p className="small">Only these coded details and your phone’s GPS are sent. Your message and any place names stay on your phone.</p></details>
      </section>:<Navigate to="/" replace/>}/>
      <Route path="/send" element={<Navigate to="/" replace/>}/>
      <Route path="/reports" element={<section><p className="eyebrow">ON THIS PHONE</p><h1>My reports</h1>{storageNote}
        {snapshot.reports.length===0?<div className="card mt-6"><FileText aria-hidden="true" size={32}/><h2>No reports yet</h2><p>Reports appear here after you send them.</p></div>:<ul className="report-list">{snapshot.reports.map(report=>{
          const fields=unpackFrame(fromHex(report.hex)); const Icon=hazardIcons[fields.hazard];
          return <li className="card" key={report.id}><div className={`triage triage-${fields.priority}`}>{priorityLabels[fields.priority]}</div>
            <h2 className="flex items-center gap-3"><Icon aria-hidden="true" size={22}/>{hazardLabels[fields.hazard]}</h2>
            <p>{people(fields.adults,fields.children)}</p>
            <time dateTime={new Date(report.handedAt*1000).toISOString()}>{new Date(report.handedAt*1000).toLocaleString()}</time>
            <Status>{report.status}</Status><details className="tech-details"><summary>18-byte frame · seq {fields.seq}</summary><code className="hex">{report.hex}</code></details></li>;
        })}</ul>}
        <Link to="/" className="button primary full-width mt-6">New report <ArrowRight aria-hidden="true" size={20}/></Link>
      </section>}/>
      <Route path="*" element={<section><h1>Page not found</h1><Link className="button primary" to="/">Go to report</Link></section>}/>
    </Routes>
    <Sheet open={Boolean(editor&&draft)} onClose={()=>setEditor(null)} title={editor?titles[editor]:'Edit report'}>
      {draft&&<>
        {editor==='priority'&&<div className="choice-list">{priorityLabels.map((label,value)=><Choice key={value} selected={draft.priority===value} onClick={()=>{patch({priority:value as Draft['priority']});setEditor(null);}}>{label}</Choice>)}</div>}
        {editor==='hazard'&&<div className="choice-list">{hazardLabels.map((label,value)=>{const Icon=hazardIcons[value];return <Choice key={value} selected={draft.hazard===value} onClick={()=>{patch({hazard:value as Draft['hazard']});setEditor(null);}}><Icon aria-hidden="true" size={22}/>{label}</Choice>;})}</div>}
        {editor==='status'&&<div className="choice-list">{statusLabels.map((label,value)=><Choice key={value} selected={draft.status===value} onClick={()=>{patch({status:value as Draft['status']});setEditor(null);}}>{label}</Choice>)}</div>}
        {editor==='people'&&<><Stepper label="Adults" value={draft.adults} onChange={adults=>patch({adults})}/><Stepper label="Children" value={draft.children} onChange={children=>patch({children})}/></>}
        {editor==='medical'&&<div className="medical-grid">{medicalLabels.map((label,i)=>{const Icon=medicalIcons[i];return <Choice key={label} selected={Boolean(draft.medicalFlags&(1<<i))} onClick={()=>patch({medicalFlags:draft.medicalFlags^(1<<i)})}><Icon aria-hidden="true" size={22}/>{label}</Choice>;})}</div>}
        {editor==='location'&&<><p>{gpsText}</p>{gps.bucket!==0&&<p className="hex">{gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}</p>}
          <Button onClick={requestGps} disabled={gps.state==='loading'}>Refresh GPS</Button>
          <p>GPS shows where your phone is. How did you describe the emergency’s location?</p>
          <div className="choice-list">{locationLabels.map((label,value)=><Choice key={value} selected={draft.locationType===value} onClick={()=>patch({locationType:value as Draft['locationType']})}>{label}</Choice>)}</div>
        </>}
        {(editor==='people'||editor==='medical'||editor==='location')&&<Button className="primary full-width mt-6" onClick={()=>setEditor(null)}>Done</Button>}
      </>}
    </Sheet>
  </>;
}
