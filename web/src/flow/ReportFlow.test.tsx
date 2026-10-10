import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  await user.click(screen.getByRole('button',{name:/^Analyze/}));
  expect(await screen.findByRole('heading',{name:'Review your report'})).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('button',{name:'No, I’m reporting for someone else'})).toHaveAttribute('aria-pressed','true');
  await user.click(screen.getByRole('button',{name:'Yes, I’m at the emergency'}));
  await user.click(screen.getByRole('button',{name:'Edit priority'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'YELLOW · Serious but stable'}));
  await user.click(screen.getByRole('button',{name:'Edit hazard'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Flood'}));
  await user.click(screen.getByRole('button',{name:'Edit adults'}));
  await user.click(screen.getByRole('button',{name:'Increase adults'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  expect(await screen.findByRole('heading',{name:'Send your report'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();const hex=relay.mock.calls[0][0];
  expect(hex).toMatch(/^[A-F0-9]{36}$/);
  expect(unpackFrame(fromHex(hex))).toMatchObject({priority:1,hazard:1,adults:4,children:1,thirdParty:false,
    medicalFlags:0x1402,locationType:2,gpsAccuracy:0,lat:0,lon:0,seq:0});
  expect(JSON.stringify([...data.values()])).not.toContain(message);
  expect(store.snapshot().seq).toBe(1);
  expect(screen.getByRole('link',{name:'Open relay with the same report'})).toHaveAttribute('href',RELAY_URL+hex);
  await user.click(screen.getAllByRole('link',{name:'My reports'})[0]);
  expect(await screen.findByRole('heading',{name:'My reports'})).toBeInTheDocument();
  expect(screen.getByText('handed to relay')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Flood'})).toBeInTheDocument();
  cleanup();draw('/reports');expect(screen.getByText('handed to relay')).toBeInTheDocument();
});
it('offers manual mode on analysis failure and supports empty manual entry',async()=>{
  const {user}=setup({classify:async()=>{throw Error('failed');}});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'Help');
  await user.click(screen.getByRole('button',{name:/^Analyze/}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Analysis is unavailable');
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  expect(await screen.findByRole('heading',{name:'Review your report'})).toBeInTheDocument();
  expect(screen.getByText('Manual report — choose every field.')).toBeInTheDocument();
});
it('requests high-accuracy GPS and includes its bucket and coordinates',async()=>{
  const getCurrentPosition=vi.fn((success:PositionCallback)=>success({coords:{latitude:30.2672,longitude:-97.7431,accuracy:8}} as GeolocationPosition));
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition},configurable:true});
  const {user,relay}=setup();
  await user.click(screen.getByRole('button',{name:'Get location'}));
  expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:true,timeout:10000});
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  const decoded=unpackFrame(fromHex(relay.mock.calls[0][0]));
  expect(decoded.gpsAccuracy).toBe(2);expect(decoded.lat).toBeCloseTo(30.2672,4);expect(decoded.lon).toBeCloseTo(-97.7431,4);
});
it('clears location on GPS failure and still sends without a fix',async()=>{
  const getCurrentPosition=vi.fn((_:PositionCallback,error:PositionErrorCallback)=>error({code:1} as GeolocationPositionError));
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition},configurable:true});
  const {user,relay}=setup();await user.click(screen.getByRole('button',{name:'Get location'}));
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  await user.click(screen.getByRole('button',{name:/Continue to send/}));await user.click(screen.getByRole('button',{name:'Send'}));
  expect(unpackFrame(fromHex(relay.mock.calls[0][0]))).toMatchObject({gpsAccuracy:0,lat:0,lon:0});
});
it('does not complete stale analysis after leaving Report',async()=>{
  let finish!:(value:Awaited<ReturnType<Classifier['classify']>>)=>void;
  const task=new Promise<Awaited<ReturnType<Classifier['classify']>>>(resolve=>{finish=resolve;});
  const {user}=setup({classify:()=>task});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'test');
  await user.click(screen.getByRole('button',{name:/^Analyze/}));
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
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  await user.dblClick(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();expect(store.snapshot().seq).toBe(1);expect(store.snapshot().reports).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent('Navigation was blocked');
  expect(screen.getByRole('link',{name:'Open relay with the same report'})).toHaveAttribute('href',RELAY_URL+store.snapshot().reports[0].hex);
});
it('keeps sending available when localStorage is blocked',async()=>{
  const safe=createStorage(()=>{throw Error('storage blocked');});
  const store=createReportStore(safe,()=>4);const relay=vi.fn();const user=userEvent.setup();
  render(<MemoryRouter><ThemeProvider><App classifier={new MockClassifier({delayMs:0})} store={store} relayNavigate={relay}/></ThemeProvider></MemoryRouter>);
  expect(screen.getByText(/Storage is unavailable/)).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(relay).toHaveBeenCalledOnce();expect(store.snapshot().seq).toBe(1);expect(store.snapshot().reports).toHaveLength(1);
});
it('shows the processing screen until classification completes',async()=>{
  let finish!:(value:Awaited<ReturnType<Classifier['classify']>>)=>void;
  const pending=new Promise<Awaited<ReturnType<Classifier['classify']>>>(resolve=>{finish=resolve;});
  const {user}=setup({classify:()=>pending});
  await user.type(screen.getByLabelText('What’s happening? Who needs help?'),'People need help');
  await user.click(screen.getByRole('button',{name:/^Analyze/}));
  expect(await screen.findByRole('heading',{name:'Analyzing your report'})).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Processing your message…'})).toBeInTheDocument();
  finish(await new MockClassifier({delayMs:0}).classify('test'));
  expect(await screen.findByRole('heading',{name:'Review your report'})).toBeInTheDocument();
});
it('retains corrections to rescue status, children, medical needs, and location confidence in the sent frame',async()=>{
  const {user,relay}=setup();
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  expect(screen.getByRole('button',{name:'Edit adults'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Edit children'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Edit rescue status'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Exposed'}));
  await user.click(screen.getByRole('button',{name:'Edit children'}));
  await user.click(screen.getByRole('button',{name:'Increase children'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'Edit medical needs'}));
  await user.click(screen.getByRole('button',{name:'Insulin'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'Edit location confidence'}));
  await user.click(screen.getByRole('button',{name:'Street address'}));
  await user.click(screen.getByRole('button',{name:'Done'}));
  await user.click(screen.getByRole('button',{name:'No, I’m reporting for someone else'}));
  expect(screen.getByText('Reporting for someone else')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  await user.click(screen.getByRole('link',{name:'Back to review'}));
  expect(screen.getByRole('button',{name:'Edit rescue status'})).toHaveTextContent('Exposed');
  expect(screen.getByRole('button',{name:'Edit children'})).toHaveTextContent('1');
  expect(screen.getByRole('button',{name:'Edit medical needs'})).toHaveTextContent('Insulin');
  expect(screen.getByRole('button',{name:'Edit location confidence'})).toHaveTextContent('Street address');
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  await user.click(screen.getByRole('button',{name:'Send'}));
  expect(unpackFrame(fromHex(relay.mock.calls[0][0]))).toMatchObject({status:1,adults:1,children:1,
    medicalFlags:0x1901,thirdParty:true,locationType:3});
});


it('shows collapsed 18-byte sections and uppercase hex on Review and Send',async()=>{
  const {user}=setup();
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  const reviewSummary=screen.getByText('18 bytes',{selector:'summary'});
  const reviewDetails=reviewSummary.closest('details')!;
  expect(reviewDetails).not.toHaveAttribute('open');
  await user.click(reviewSummary);
  expect(reviewDetails).toHaveAttribute('open');
  const reviewHex=reviewDetails.querySelector('code')!.textContent!;
  expect(reviewHex).toMatch(/^[0-9A-F]{36}$/);expect(fromHex(reviewHex)).toHaveLength(18);
  await user.click(screen.getByRole('button',{name:/Continue to send/}));
  const sendSummary=screen.getByText('18 bytes',{selector:'summary'});
  const sendDetails=sendSummary.closest('details')!;
  expect(sendDetails).not.toHaveAttribute('open');
  await user.click(sendSummary);
  expect(sendDetails).toHaveAttribute('open');
  const sendHex=sendDetails.querySelector('code')!.textContent!;
  expect(sendHex).toMatch(/^[0-9A-F]{36}$/);expect(fromHex(sendHex)).toHaveLength(18);
});

it('starts an empty manual report with one adult (the writer, §5.4 rule 5) and no children',async()=>{
  const {user}=setup();
  await user.click(screen.getByRole('button',{name:'Fill in manually'}));
  expect(screen.getByRole('button',{name:'Edit adults'})).toHaveTextContent('1');
  expect(screen.getByRole('button',{name:'Edit children'})).toHaveTextContent('0');
});
