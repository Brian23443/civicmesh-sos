// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createStorage } from './storage';
import { createReportStore } from './reports';
import { unpackFrame } from '../protocol/packer';
import { fromHex } from '../protocol/hex';
import type { FrameFields } from '../protocol/types';
const fields:FrameFields={priority:2,hazard:1,status:2,adults:2,children:1,medicalFlags:1,thirdParty:false,
  locationType:0,lat:30.2672,lon:-97.7431,gpsAccuracy:2,timestamp:1760000000,deviceId:48879,seq:0};
function backend() {const data=new Map<string,string>(); return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};}
describe('report persistence',()=>{
  it('stores only frame and metadata, advances identity, and reloads',()=>{
    const b=backend();const s=createReportStore(createStorage(()=>b),()=>48879);
    const r=s.handoff(fields);expect(r.hex).toBe('861200012B0BF3BA7E6A68E77800BEEF0050');
    expect(Object.keys(r).sort()).toEqual(['handedAt','hex','id','status']);
    expect(s.snapshot().seq).toBe(1);expect(s.snapshot().reports[0]).toEqual(r);
    const reloaded=createReportStore(createStorage(()=>b),()=>99);
    expect(reloaded.snapshot()).toEqual(s.snapshot());
    expect(()=>s.handoff(fields)).toThrow('sequence changed');expect(s.snapshot().reports).toHaveLength(1);
  });
  it('wraps seq 255 to zero in the same stored snapshot as history',()=>{
    const b=backend();b.setItem('civicmesh:reports:v1',JSON.stringify({deviceId:48879,seq:255,reports:[]}));
    const s=createReportStore(createStorage(()=>b));const report=s.handoff({...fields,seq:255});
    expect(unpackFrame(fromHex(report.hex)).seq).toBe(255);
    const state=JSON.parse(b.getItem('civicmesh:reports:v1')!);
    expect(state.seq).toBe(0);expect(state.reports).toHaveLength(1);
  });
  it('allows handoff and preserves session history when all storage access throws',()=>{
    const s=createReportStore(createStorage(()=>{throw Error('private mode');}),()=>48879);
    const report=s.handoff(fields);expect(s.persistent).toBe(false);
    expect(s.snapshot().reports).toEqual([report]);expect(s.snapshot().seq).toBe(1);
  });
  it('ignores malformed persisted records and prevents consumer mutation',()=>{
    const b=backend();b.setItem('civicmesh:reports:v1',JSON.stringify({deviceId:2,seq:0,reports:[{hex:'broken'}]}));
    const s=createReportStore(createStorage(()=>b),()=>48879);expect(s.snapshot().deviceId).toBe(48879);
    const state=s.snapshot();state.seq=100;state.reports.push({id:'fake',hex:'bad',status:'handed to relay',handedAt:0});
    expect(s.snapshot()).toEqual({deviceId:48879,seq:0,reports:[]});
  });
});
