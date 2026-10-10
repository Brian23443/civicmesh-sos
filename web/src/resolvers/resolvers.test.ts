// @vitest-environment node
import { expect, it } from 'vitest';
import { MedicalFlags as F } from '../protocol/enums';
import { packFrame, unpackFrame } from '../protocol/packer';
import { resolveHeadcount, resolveLocation, resolveMedical, resolveReport } from './index';

it.each([
  ['',0,0], ['4 ppl',4,0], ['1 kid',0,1], ['mi bebé',0,1], ['me and my 2 kids',1,2],
  ['3 of us',3,0], ['two adults and a toddler',2,1], ['me and my wife',2,0],
  ['me and my grandma',2,0], ['alone',1,0], ['just me',1,0], ['a couple',2,0],
  ['both of us',2,0], ['twins',0,2], ['una niña',0,1], ['dos adultos y tres hijos',2,3],
  ['99 children and twenty adults',15,15], ['0 adults and 0 children',0,0],
  ['7 people including 2 kids',5,2], ['three kids among ten passengers',7,3],
  ['twenty people including nineteen kids',1,15], ['six men and two girls',6,2],
  ['seis personas y dos bebés',4,2], ['AN INFANT',0,1], ['a newborn',0,1],
  ['nineteen teenagers',0,15], ['two students',2,0], ['one person',1,0],
  ['a couple kids',0,2], ['a couple people and one child',1,1], ['two adults, two adults',2,0], ['kidney problem',0,0],
  ['a childlike drawing',0,0], ['someone has a son',0,1], ['THREE\nOF US',3,0],
])('headcount: %s', (text, adults, children) => {
  expect(resolveHeadcount(text)).toEqual({ adults, children });
});

// Independent keyword examples, never sourced from Appendix A.
it.each([
  ['INSULIN',F.INSULIN], ['diabetic',F.INSULIN], ['blood sugar',F.INSULIN],
  ["sugar's low",F.INSULIN], ['sugar’s low',F.INSULIN], ['type 2',F.INSULIN],
  ['insulina',F.INSULIN], ['diabética',F.INSULIN],
  ['cant breath',F.OXYGEN], ["can't breathe",F.OXYGEN], ['cannot breath',F.OXYGEN],
  ['no puedo respirar',F.OXYGEN], ['choking on smoke',F.OXYGEN], ['inhaler',F.OXYGEN],
  ['bleeding',F.BLEEDING], ['hemorrhaging',F.BLEEDING], ['sangrando',F.BLEEDING],
  ['tourniquet',F.BLEEDING], ['deep cut',F.BLEEDING],
  ['hypothermic',F.HYPOTHERMIA], ['blue lips',F.HYPOTHERMIA], ['hipotermia',F.HYPOTHERMIA],
  ['shivering',F.HYPOTHERMIA],
  ['silla de ruedas',F.MOBILITY_IMPAIRED], ['paralyzed',F.MOBILITY_IMPAIRED],
  ['broken pelvis',F.MOBILITY_IMPAIRED], ['cannot walk',F.MOBILITY_IMPAIRED],
  ['pacemaker',F.CARDIAC], ['dolor de pecho',F.CARDIAC], ['infarto',F.CARDIAC],
  ['heart condition',F.CARDIAC],
  ['embarazada',F.PREGNANCY_INFANT], ['water broke',F.PREGNANCY_INFANT],
  ['in labor',F.PREGNANCY_INFANT], ['newborn',F.PREGNANCY_INFANT],
  ['burned',F.BURNS], ['burns',F.BURNS], ['burnt',F.BURNS], ['scalded',F.BURNS],
  ['blisters',F.BURNS], ['quemaduras',F.BURNS],
])('medical: %s', (text, mask) => {
  expect(resolveMedical(text)).toBe(mask);
});
it.each(['', 'burn barrel', 'sunburn', 'sunburns', 'oxygenated', 'asthmatician', 'gasholder', 'infantry', 'type 12'])('does not match medical substrings: %s', text => {
  expect(resolveMedical(text)).toBe(0);
});
it('ORs independent medical needs and resets across calls', () => {
  expect(resolveMedical('Insulin, oxygen, bleeding, shivering, wheelchair, chest pain, pregnant, burned')).toBe(0xff);
  expect(resolveMedical('nothing mentioned')).toBe(0);
});
it('does not suppress a real burn mention near the exclusions', () => {
  expect(resolveMedical('burn barrel; her hand is burned')).toBe(F.BURNS);
});

it.each([
  ['',0,null,0], ['Waiting here',0,null,0],
  ['At 84 Willow Lane',3,'84 Willow Lane',0x1800],
  ['Go to 908 North Pine Rd.',3,'908 North Pine Rd.',0x1800],
  ['44 Oak St by the hospital',3,'44 Oak St',0x1800],
  ['Around the corner from 44 Oak St',3,'44 Oak St (Around the corner)',0x1800],
  ['Meet at HOME DEPOT',2,'HOME DEPOT',0x1400],
  ['At the middle school',2,'middle school',0x1400],
  ['Near the hospital, a few blocks away',2,'hospital (a few blocks away)',0x1400],
  ['Down the street',1,'Down the street',0x1200],
  ['Somewhere nearby',1,'nearby',0x1200],
  ['Costco',2,'Costco',0x1400], ['HEB',2,'HEB',0x1400],
  ['City Hall',2,'City Hall',0x1400], ['The fire station',2,'fire station',0x1400],
  ['The police station',2,'police station',0x1400],
  ['hospitality and targetable malls',0,null,0],
  ['123456 Oak St',0,null,0], ['An overpass',2,'overpass',0x1400],
])('location: %s', (message, type, text, flags) => {
  expect(resolveLocation(message)).toEqual({ type, text, flags });
});
it.each(['Ln','Street','St','Road','Rd','Avenue','Ave','Boulevard','Blvd','Drive','Dr','Court','Ct','Way','Highway','Hwy','Terrace','Place','Pl'])('recognizes address suffix %s', suffix => {
  expect(resolveLocation(`at 321 Maple ${suffix}`)).toEqual({ type: 3, text: `321 Maple ${suffix}`, flags: 0x1800 });
});
it('combines resolvers into protocol-compatible fields without sending text', () => {
  const result = resolveReport('four people including one child need oxygen at the library nearby');
  expect(result).toEqual({ adults:3, children:1, medicalFlags:2,
    location: { type:2, text:'library (nearby)', flags:0x1400 }, flags:0x1402, suggestedThirdParty:true });
  const frame = packFrame({ priority:1, hazard:0, status:3, adults:result.adults, children:result.children,
    medicalFlags:result.flags, thirdParty:false, locationType:result.location.type,
    lat:0, lon:0, gpsAccuracy:0, timestamp:0, deviceId:0, seq:0 });
  expect(unpackFrame(frame)).toMatchObject({ flags:0x1402, thirdParty:false, locationType:2 });
  expect(resolveReport('no location mentioned').suggestedThirdParty).toBe(false);
});

