import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ThemeProvider } from '../components/ThemeProvider';
import { MockClassifier } from '../inference/mockClassifier';
import { createReportStore, RELAY_URL } from '../lib/reports';
import { createStorage } from '../lib/storage';
import { fromHex } from '../protocol/hex';
import { unpackFrame } from '../protocol/packer';
import type { Classifier } from '../inference/types';
vi.mock('virtual:pwa-register/react',()=>({useRegisterSW:()=>({offlineReady:[true,vi.fn()]})}));
beforeAll(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
});
afterEach(()=>{vi.restoreAllMocks();Object.defineProperty(navigator,'geolocation',{value:undefined,configurable:true});});
function setup(classifier:Classifier=new MockClassifier({delayMs:0}),initial='/') {
  const data=new Map<string,string>();const safe=createStorage(()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}}));
  const store=createReportStore(safe,()=>0xbeef);
  const relay=vi.fn((hex:string)=>{
    const saved=JSON.parse(data.get('civicmesh:reports:v1')!);
    expect(saved.seq).toBe(1);expect(saved.reports[0].hex).toBe(hex);
  });
  const draw=(path=initial)=>render(<MemoryRouter initialEntries={[path]}><ThemeProvider><App classifier={classifier} store={store} relayNavigate={relay}/></ThemeProvider></MemoryRouter>);
  draw();return {user:userEvent.setup(),store,relay,data,draw};
}
it('analyzes, edits review, preserves user choice, saves before navigation, and displays history',async()=>{
  const {user,store,relay,data,draw}=setup();
  const message='Four people including one child need oxygen near the library.';
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),message);
  await user.click(screen.getByRole('button',{name:/^Send for help/}));
  expect(await screen.findByRole('heading',{name:'Ready to send'})).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('button',{name:'No, it’s someone else'})).toHaveAttribute('aria-pressed','true');
  await user.click(screen.getByRole('button',{name:'Yes, I’m here'}));
  await user.click(screen.getByRole('button',{name:'Edit priority'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'YELLOW · Serious but stable'}));
  await user.click(screen.getByRole('button',{name:'Edit emergency'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Flood'}));
  await user.click(screen.getByRole('button',{name:'Edit people'}));
  await user.click(screen.getByRole('button',{name:'Increase adults'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();const hex=relay.mock.calls[0][0];
  expect(hex).toMatch(/^[A-F0-9]{36}$/);
  expect(unpackFrame(fromHex(hex))).toMatchObject({priority:1,hazard:1,adults:4,children:1,thirdParty:false,
    medicalFlags:0x1402,locationType:2,gpsAccuracy:0,lat:0,lon:0,seq:0});
  expect(JSON.stringify([...data.values()])).not.toContain(message);
  expect(store.snapshot().seq).toBe(1);
  expect(screen.getByRole('link',{name:'Didn’t see “Report sent”? Send again (same report)'})).toHaveAttribute('href',RELAY_URL+hex);
  expect(screen.getByText('Report handed to the relay')).toBeInTheDocument();
  expect(screen.getByText(/· Flood · 5 people \(4 adults, 1 child\)$/)).toBeInTheDocument();
  await user.click(screen.getAllByRole('link',{name:'My reports'})[0]);
  expect(await screen.findByRole('heading',{name:'My reports'})).toBeInTheDocument();
  expect(screen.getByText('handed to relay')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Flood'})).toBeInTheDocument();
  cleanup();draw('/reports');expect(screen.getByText('handed to relay')).toBeInTheDocument();
});
it('offers manual mode on analysis failure and supports empty manual entry',async()=>{
  const {user}=setup({classify:async()=>{throw Error('failed');}});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'Help');
  await user.click(screen.getByRole('button',{name:/^Send for help/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t read the message');
  await user.click(screen.getByRole('button',{name:'Choose from a list'}));
  expect(await screen.findByRole('heading',{name:'Ready to send'})).toBeInTheDocument();
  expect(screen.getByText('Tap each item to set it.')).toBeInTheDocument();
});
it('requests high-accuracy GPS and includes its bucket and coordinates',async()=>{
  const getCurrentPosition=vi.fn((success:PositionCallback)=>success({coords:{latitude:30.2672,longitude:-97.7431,accuracy:8}} as GeolocationPosition));
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition},configurable:true});
  const {user,relay}=setup();
  // Starts by itself on opening the app — no button to find.
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:true,timeout:10000});
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  const decoded=unpackFrame(fromHex(relay.mock.calls[0][0]));
  expect(decoded.gpsAccuracy).toBe(2);expect(decoded.lat).toBeCloseTo(30.2672,4);expect(decoded.lon).toBeCloseTo(-97.7431,4);
});
it('clears location on GPS failure and still sends without a fix',async()=>{
  const getCurrentPosition=vi.fn((_:PositionCallback,error:PositionErrorCallback)=>error({code:1} as GeolocationPositionError));
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition},configurable:true});
  const {user,relay}=setup();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(unpackFrame(fromHex(relay.mock.calls[0][0]))).toMatchObject({gpsAccuracy:0,lat:0,lon:0});
});
it('does not complete stale analysis after leaving Report',async()=>{
  let finish!:(value:Awaited<ReturnType<Classifier['classify']>>)=>void;
  const task=new Promise<Awaited<ReturnType<Classifier['classify']>>>(resolve=>{finish=resolve;});
  const {user}=setup({classify:()=>task});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'test');
  await user.click(screen.getByRole('button',{name:/^Send for help/}));
  await user.click(screen.getAllByRole('link',{name:'My reports'})[0]);
  finish(await new MockClassifier({delayMs:0}).classify('test'));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'My reports'})).toBeInTheDocument());
});
it.each(['/analyze','/review','/send'])('redirects a refreshed %s route without a draft',async path=>{
  setup(undefined,path);expect(await screen.findByRole('heading',{name:'What’s happening?'})).toBeInTheDocument();
});
it('guards repeated Send clicks and allows retry without consuming another sequence',async()=>{
  const {user,relay,store}=setup();
  relay.mockImplementation(()=>{throw Error('blocked');});
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  await user.dblClick(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();expect(store.snapshot().seq).toBe(1);expect(store.snapshot().reports).toHaveLength(1);
  expect(screen.getByText('Report saved — the relay didn’t open')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Didn’t see “Report sent”? Send again (same report)'})).toHaveAttribute('href',RELAY_URL+store.snapshot().reports[0].hex);
});
it('keeps sending available when localStorage is blocked',async()=>{
  const safe=createStorage(()=>{throw Error('storage blocked');});
  const store=createReportStore(safe,()=>4);const relay=vi.fn();const user=userEvent.setup();
  render(<MemoryRouter><ThemeProvider><App classifier={new MockClassifier({delayMs:0})} store={store} relayNavigate={relay}/></ThemeProvider></MemoryRouter>);
  expect(screen.getByText(/Storage is unavailable/)).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();expect(store.snapshot().seq).toBe(1);expect(store.snapshot().reports).toHaveLength(1);
});
it('shows the processing screen until classification completes',async()=>{
  let finish!:(value:Awaited<ReturnType<Classifier['classify']>>)=>void;
  const pending=new Promise<Awaited<ReturnType<Classifier['classify']>>>(resolve=>{finish=resolve;});
  const {user}=setup({classify:()=>pending});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'People need help');
  await user.click(screen.getByRole('button',{name:/^Send for help/}));
  expect(await screen.findByRole('heading',{name:'Reading your message'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Reading your message…'})).toBeInTheDocument();
  finish(await new MockClassifier({delayMs:0}).classify('test'));
  expect(await screen.findByRole('heading',{name:'Ready to send'})).toBeInTheDocument();
});
it('retains corrections to rescue status, children, medical needs, and location confidence in the sent frame',async()=>{
  const {user,relay}=setup();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  await user.click(screen.getByRole('button',{name:'Edit situation'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Exposed'}));
  await user.click(screen.getByRole('button',{name:'Edit people'}));
  await user.click(screen.getByRole('button',{name:'Increase children'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'Edit medical needs'}));
  await user.click(screen.getByRole('button',{name:'Insulin'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'Edit location'}));
  await user.click(screen.getByRole('button',{name:'Street address'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'No, it’s someone else'}));
  expect(screen.getByRole('button',{name:'No, it’s someone else'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:'Edit situation'})).toHaveTextContent('Exposed');
  expect(screen.getByRole('button',{name:'Edit people'})).toHaveTextContent('2 people (1 adult, 1 child)');
  expect(screen.getByRole('button',{name:'Edit medical needs'})).toHaveTextContent('Insulin');
  expect(screen.getByRole('button',{name:'Edit location'})).toHaveTextContent('Street address');
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(unpackFrame(fromHex(relay.mock.calls[0][0]))).toMatchObject({status:1,adults:1,children:1,
    medicalFlags:0x1901,thirdParty:true,locationType:3});
});

it('shows a collapsed 18-byte section with uppercase hex on the send screen',async()=>{
  const {user}=setup();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  const summary=screen.getByText('What gets sent (18 bytes)',{selector:'summary'});
  const details=summary.closest('details')!;
  expect(details).not.toHaveAttribute('open');
  await user.click(summary);
  expect(details).toHaveAttribute('open');
  const hex=details.querySelector('code')!.textContent!;
  expect(hex).toMatch(/^[0-9A-F]{36}$/);expect(fromHex(hex)).toHaveLength(18);
});

it('starts an empty manual report with one adult (the writer, §5.4 rule 5) and no children',async()=>{
  const {user}=setup();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  expect(screen.getByRole('button',{name:'Edit people'})).toHaveTextContent(/1 person$/);
});

it('sends in two taps: message → Send for help → Send',async()=>{
  const {user,relay}=setup();
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'water in the attic, 2 of us');
  await user.click(screen.getByRole('button',{name:'Send for help'}));
  await screen.findByRole('heading',{name:'Ready to send'});
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();
  // Back on a fresh home screen, ready for an update; a banner confirms what went out.
  expect(screen.getByText('Report handed to the relay')).toBeInTheDocument();
  expect(screen.getByLabelText('What’s happening? Who needs help?')).toHaveValue('');
  expect(screen.getByRole('heading',{name:'Anything else?'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Dismiss'}));
  expect(screen.queryByText('Report handed to the relay')).not.toBeInTheDocument();
});

it('adds quick phrases to the message for people who can’t type much',async()=>{
  const {user}=setup();
  const box=screen.getByLabelText('What’s happening? Who needs help?');
  await user.click(screen.getByRole('button',{name:'I’m trapped'}));
  await user.click(screen.getByRole('button',{name:'Children with me'}));
  expect(box).toHaveValue('I’m trapped. Children with me.');
});

it('sends with the newest GPS fix even if it arrives after Send for help',async()=>{
  let report!:PositionCallback;
  const getCurrentPosition=vi.fn((success:PositionCallback)=>{report=success;});
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition,watchPosition:vi.fn(()=>1),clearWatch:vi.fn()},configurable:true});
  const {user,relay}=setup();
  await user.click(screen.getByRole('button',{name:'Can’t type? Choose from a list'}));
  expect(screen.getByRole('button',{name:'Send now (location still loading)'})).toBeInTheDocument();
  act(()=>report({coords:{latitude:40.5,longitude:-74.45,accuracy:9}} as GeolocationPosition));
  await user.click(await screen.findByRole('button',{name:'Send'}));
  expect(unpackFrame(fromHex(relay.mock.calls[0][0]))).toMatchObject({gpsAccuracy:2});
});
