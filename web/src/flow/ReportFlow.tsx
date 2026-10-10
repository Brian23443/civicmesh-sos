import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, FileText, LoaderCircle, MapPin, Minus, Plus, Radio, Wifi, Plane } from 'lucide-react';
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

export function ReportFlow({ classifier, store, relayNavigate, onGpsStatus, analysisReady=true }: Props) {
  const navigate=useNavigate(); const route=useLocation();
  const [message,setMessage]=useState(''); const [draft,setDraft]=useState<Draft|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [prepared,setPrepared]=useState<FrameFields|null>(null); const [receipt,setReceipt]=useState<SentReport|null>(null);
  const [editor,setEditor]=useState<Editor>(null); const [snapshot,setSnapshot]=useState(()=>store.snapshot());
  const analyzeRun=useRef(0); const gpsRun=useRef(0); const sending=useRef(false); const mounted=useRef(true);
  useEffect(()=>{ mounted.current=true; return ()=>{mounted.current=false; analyzeRun.current++;gpsRun.current++;}; },[]);
  useEffect(()=>{
    if(route.pathname!=='/analyze'){analyzeRun.current++;setBusy(false);setError('');}
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
  function patch(fields: Partial<Draft>) { setDraft(current=>current ? {...current,...fields}:current); }
  async function analyze() {
    if(busy||!analysisReady||!message.trim()) return;
    if(!gpsUpdate || gpsUpdate.phase==='timeout' || gpsUpdate.phase==='unavailable') requestGps();
    const run=++analyzeRun.current; const text=message; setDraft(null);setBusy(true);setError('');setReceipt(null);setPrepared(null);navigate('/analyze');
    try {
      const result=await classifier.classify(text);
      if(!mounted.current||run!==analyzeRun.current) return;
      // Model + §5.4 resolvers, combined exactly like Python's to_slots (finalize.ts).
      setDraft({...finalizeReport(result,resolveReport(text),classifier.settings),mode:'model'});
      navigate('/review');
    } catch {if(mounted.current && run===analyzeRun.current) setError('Analysis is unavailable. You can fill in every field manually.');}
    finally {if(mounted.current && run===analyzeRun.current) setBusy(false);}
  }
  function manual() {
    analyzeRun.current++;setBusy(false);setError('');setPrepared(null);setReceipt(null);
    const fields=resolveReport(message);
    setDraft({...MANUAL,adults:fields.adults,children:fields.children,medicalFlags:fields.medicalFlags,
      thirdParty:fields.suggestedThirdParty,locationType:fields.location.type,locationText:fields.location.text}); navigate('/review');
  }
  function packet():FrameFields {
    if(!draft) throw Error('No report');
    const identity=store.snapshot();
    return {priority:draft.priority,hazard:draft.hazard,status:draft.status,adults:draft.adults,children:draft.children,
      medicalFlags:draft.medicalFlags,thirdParty:draft.thirdParty,locationType:draft.locationType,
      lat:gps.bucket===0?0:gps.lat,lon:gps.bucket===0?0:gps.lon,gpsAccuracy:gps.bucket,
      timestamp:Math.floor(Date.now()/1000),deviceId:identity.deviceId,seq:identity.seq};
  }
  function continueToSend() {try {setPrepared(packet());setReceipt(null);sending.current=false;navigate('/send');}catch{setError('Check the report fields before continuing.');}}
  function send() {
    if(!prepared || sending.current) return;
    sending.current=true;setError('');
    let report:SentReport;
    try {report=store.handoff(prepared);setSnapshot(store.snapshot());setReceipt(report);setPrepared(null);setDraft(null);setMessage('');}
    catch(e){sending.current=false;setError(e instanceof Error?e.message:'Could not prepare report. Return to review.');return;}
    // Everything required to survive navigation is committed before this call.
    try {relayNavigate(report.hex);} catch {setError('Report saved. Navigation was blocked; use the relay link below to retry the same frame.');}
  }
  const titles={priority:'Edit priority',hazard:'Edit hazard',status:'Edit rescue status',people:'Edit people',medical:'Edit medical needs',location:'Edit location'};
  let preview=''; if(draft) {try {preview=pack(packet());}catch {/* Send validation supplies the actionable message. */}}
  const HazardIcon=hazardIcons[draft?.hazard??0];
  const storageNote=!store.persistent ? <p role="status" className="notice">Storage is unavailable. Reports stay in memory for this session; sending still works.</p>:null;
  return <>
    <Routes>
      <Route path="/" element={<section><p className="eyebrow">HELP STARTS HERE</p><h1>What’s happening?</h1><p>Tell us who needs help. You can check and change every field before sending.</p>
        <form className="card mt-6" onSubmit={e=>{e.preventDefault();void analyze();}}>
          <label htmlFor="message">What’s happening? Who needs help?</label>
          <textarea id="message" value={message} onChange={e=>setMessage(e.target.value)} disabled={busy} rows={6} placeholder="For example: Three people need help near the library."/>
          <p className="small">Your original message is never transmitted.</p>
          <Button type="submit" className="primary full-width" disabled={busy||!analysisReady||!message.trim()} aria-busy={busy}>{busy?<><LoaderCircle className="spinner" aria-hidden="true" size={20}/>Analyzing…</>:<>Analyze <ArrowRight aria-hidden="true" size={20}/></>}</Button>
          <Button className="full-width mt-3" onClick={manual}>Fill in manually</Button>
        </form>
        {error&&<p role="alert" className="notice">{error}</p>}
        <div className="flex items-center justify-between gap-3 mt-6"><span aria-live="polite">{gpsText}</span><Button onClick={requestGps} disabled={gps.state==='loading'}><MapPin aria-hidden="true" size={18}/>Get location</Button></div>
        <Link className="text-link" to="/reports">My reports <ArrowRight aria-hidden="true" size={18}/></Link>{storageNote}
      </section>}/>
      <Route path="/analyze" element={busy||error?<section aria-busy={busy}>
        <p className="eyebrow">ANALYZE</p><h1>{busy?'Analyzing your report':'Analysis unavailable'}</h1>
        {busy?<div className="card mt-6" role="status" aria-live="polite"><LoaderCircle className="spinner" aria-hidden="true" size={32}/><h2>Processing your message…</h2><p>Analyzing on this device — nothing is sent yet.</p><p>You’ll be able to correct every suggestion on the next screen.</p></div>:<p role="alert" className="notice">{error}</p>}
        <Button className="full-width mt-6" onClick={manual}>Fill in manually</Button>
        <Link to="/" className="text-link"><ArrowLeft aria-hidden="true" size={18}/>Back to report</Link>
      </section>:<Navigate to={draft?'/review':'/'} replace/>}/>
      <Route path="/review" element={draft?<section><p className="eyebrow">CHECK BEFORE SENDING</p><h1>Review your report</h1>
        <p>{draft.mode==='model'?'Suggested from your message — check every field.':'Manual report — choose every field.'}</p>
        <Button className={`triage triage-${draft.priority}`} aria-label="Edit priority" onClick={()=>setEditor('priority')}><span>{priorityLabels[draft.priority]}</span><ChevronRight aria-hidden="true"/></Button>
        <div className="review-fields mt-6"><Field onEdit={setEditor} label="Hazard" value={hazardLabels[draft.hazard]} open="hazard" icon={<HazardIcon aria-hidden="true" size={24}/>}/>
          <Field onEdit={setEditor} label="Rescue status" value={statusLabels[draft.status]} open="status"/>
          <Field onEdit={setEditor} label="Adults" value={String(draft.adults)} open="people"/>
          <Field onEdit={setEditor} label="Children" value={String(draft.children)} open="people"/>
          <Field onEdit={setEditor} label="Medical needs" value={medicalLabels.filter((_,i)=>draft.medicalFlags&(1<<i)).join(', ')||'None selected'} open="medical"/>
          <Field onEdit={setEditor} label="Location confidence" value={locationLabels[draft.locationType]} open="location" icon={<MapPin aria-hidden="true" size={24}/>}/></div>
        <p aria-live="polite"><strong>Third-party status:</strong> {draft.thirdParty?"Reporting for someone else":"At the emergency"}</p>
        <fieldset className="card mt-6"><legend>Are you at the emergency?</legend><div className="choice-list">
          <Choice selected={!draft.thirdParty} onClick={()=>patch({thirdParty:false})}>Yes, I’m at the emergency</Choice>
          <Choice selected={draft.thirdParty} onClick={()=>patch({thirdParty:true})}>No, I’m reporting for someone else</Choice></div>
          {draft.locationText&&<p className="small">You mentioned “{draft.locationText}” — GPS shows where you are, not necessarily the emergency. Your answer above always wins.</p>}
        </fieldset>
        <p className="small">{gps.bucket===0?'No GPS fix — this report will have no map location.':`${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)} · ±${Math.ceil(gps.accuracy!)} m`}</p>
        <details className="card mt-6"><summary>18 bytes</summary><code className="hex">{preview}</code><p className="small">Only structured fields and phone coordinates are sent. Your message and mentioned place text stay on your phone. The timestamp is finalized when you continue.</p></details>
        {error&&<p role="alert" className="notice">{error}</p>}{storageNote}
        <Button className="primary full-width mt-6" onClick={continueToSend}>Continue to send <ArrowRight aria-hidden="true" size={20}/></Button>
        <Link to="/" className="text-link"><ArrowLeft aria-hidden="true" size={18}/>Back to report</Link>
      </section>:<Navigate to="/" replace/>}/>
      <Route path="/send" element={receipt?<section><p className="eyebrow">SAVED ON THIS DEVICE</p><h1>Handed to relay</h1><p>The report was saved before relay navigation. Delivery to the rescue network is not confirmed here.</p>
        {error&&<p role="alert" className="notice">{error}</p>}
        <a className="button full-width" href={RELAY_URL+receipt.hex}>Open relay with the same report</a>
        <Link className="button primary full-width mt-6" to="/reports">My reports</Link>{storageNote}
      </section>:prepared?<section><p className="eyebrow">CONNECT TO THE RELAY</p><h1>Send your report</h1>
        <ol className="send-steps"><li><Plane aria-hidden="true"/><div><strong>Keep Airplane Mode on</strong><p>Turn on Wi-Fi.</p></div></li>
          <li><Wifi aria-hidden="true"/><div><strong>Join CivicMesh-SOS</strong><p>Open Wi-Fi settings and select the network.</p></div></li>
          <li><Radio aria-hidden="true"/><div><strong>Tap Send</strong><p>The relay opens and shows its reply.</p></div></li></ol>
        <div className={`triage triage-${prepared.priority}`}>{priorityLabels[prepared.priority]}</div>
        <p>{hazardLabels[prepared.hazard]} · {prepared.adults+prepared.children} people · seq {prepared.seq}</p>
        <details className="card"><summary>18 bytes</summary><code className="hex">{pack(prepared)}</code><p className="small">This exact frame will be handed to the relay.</p></details>
        {error&&<p role="alert" className="notice">{error}</p>}{storageNote}
        <Button className="primary full-width mt-6" onClick={send}>Send <ArrowRight aria-hidden="true" size={20}/></Button>
        <Link className="text-link" to="/review"><ArrowLeft aria-hidden="true" size={18}/>Back to review</Link>
      </section>:<Navigate to={draft?'/review':'/'} replace/>}/>
      <Route path="/reports" element={<section><p className="eyebrow">ON THIS DEVICE</p><h1>My reports</h1>{storageNote}
        {snapshot.reports.length===0?<div className="card mt-6"><FileText aria-hidden="true" size={32}/><h2>No reports yet</h2><p>Reports appear here when you hand them to the relay.</p></div>:<ul className="report-list">{snapshot.reports.map(report=>{
          const fields=unpackFrame(fromHex(report.hex)); const Icon=hazardIcons[fields.hazard];
          return <li className="card" key={report.id}><div className={`triage triage-${fields.priority}`}>{priorityLabels[fields.priority]}</div>
            <h2 className="flex items-center gap-3"><Icon aria-hidden="true" size={22}/>{hazardLabels[fields.hazard]}</h2>
            <p>{fields.adults} adults · {fields.children} children · seq {fields.seq}</p>
            <time dateTime={new Date(report.handedAt*1000).toISOString()}>{new Date(report.handedAt*1000).toLocaleString()}</time>
            <Status>{report.status}</Status><details><summary>18-byte frame</summary><code className="hex">{report.hex}</code></details></li>;
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
          <p>GPS describes the reporter’s phone. Choose how the emergency location was described.</p>
          <div className="choice-list">{locationLabels.map((label,value)=><Choice key={value} selected={draft.locationType===value} onClick={()=>patch({locationType:value as Draft['locationType']})}>{label}</Choice>)}</div>
        </>}
        {(editor==='people'||editor==='medical'||editor==='location')&&<Button className="primary full-width mt-6" onClick={()=>setEditor(null)}>Done</Button>}
      </>}
    </Sheet>
  </>;
}
