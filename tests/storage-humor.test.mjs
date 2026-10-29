import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNext } from '../dist/src/core/random.js';
import { defaults,loadSettings,saveSettings,validateSettings,SETTINGS_KEY } from '../dist/src/storage/settings.js';
import { RestPlaylist } from '../dist/src/media/rest-playlist.js';
test('7/8. sorteio usa somente ativos e evita repetição consecutiva', () => {
  const items=[{id:'a',enabled:true},{id:'b',enabled:false},{id:'c',enabled:true}];
  for (const random of [()=>0,()=>.999]) { assert.equal(pickNext(items,'a',random).id,'c'); assert.equal(pickNext(items,'c',random).id,'a'); }
  assert.equal(pickNext([{id:'a',enabled:false}]),undefined);
  assert.equal(pickNext([{id:'a',enabled:true}],'a').id,'a');
});
test('biblioteca tem ao menos 40 frases iniciais e IDs únicos', () => {
  const phrases=defaults().phrases; assert.ok(phrases.length>=40);
  assert.equal(new Set(phrases.map(p=>p.id)).size,phrases.length);
});
test('playlist mantém timer independente, respeita limite, duração e modo sério', () => {
  const s=defaults(); s.humor.photosPerRest=3; s.humor.photoDuration=2; s.humor.display='start';
  const photos=[{id:'a',enabled:true},{id:'b',enabled:true},{id:'c',enabled:false}];
  const playlist=new RestPlaylist();
  const first=playlist.frame('1-1',0,s,photos),second=playlist.frame('1-1',2000,s,photos),third=playlist.frame('1-1',4000,s,photos);
  assert.notEqual(first.photo.id,second.photo.id); assert.notEqual(second.photo.id,third.photo.id);
  assert.notEqual(first.phrase.id,second.phrase.id);
  assert.equal(playlist.frame('1-1',6000,s,photos),undefined);
  s.humor.display='throughout'; assert.equal(playlist.frame('1-1',60000,s,photos).photo.id,third.photo.id);
  const next=playlist.frame('1-2',0,s,photos); assert.notEqual(next.photo.id,third.photo.id);
  s.humor.mode='serious'; assert.equal(playlist.frame('1-2',0,s,photos),undefined);
});
test('sem fotos funciona com frases; sem frases funciona só com fotos', () => {
  const s=defaults(), playlist=new RestPlaylist(); assert.ok(playlist.frame('1',0,s,[]).phrase);
  s.humor.phrases=false; assert.equal(playlist.frame('2',0,s,[]).phrase,undefined);
  s.phrases.forEach(p=>p.enabled=false); s.humor.phrases=true; assert.equal(playlist.frame('3',0,s,[]).phrase,undefined);
});
test('9. configurações e frases persistem e fazem round-trip sem perda', () => {
  const map=new Map(), storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  const s=defaults(); s.training.fight=123; s.audio.enabled=false; s.humor.mode='chaos';
  s.phrases.push({id:'custom',text:'Bora treinar!',enabled:false});
  saveSettings(storage,s); assert.deepEqual(loadSettings(storage).settings,s); assert.ok(map.has(SETTINGS_KEY));
  assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(s))),s);
});
test('storage negado ou corrompido retorna padrão e aviso, sem quebrar a aplicação', () => {
  assert.ok(loadSettings({getItem:()=>'{wrong'}).warning);
  assert.ok(loadSettings({getItem:()=>{throw new Error('denied')}}).warning);
  assert.throws(()=>saveSettings({setItem:()=>{throw new Error('quota')}},defaults()));
});
test('importação rejeita dados inseguros, versões, IDs duplicados e campos fora dos limites', () => {
  const bad=[s=>s.version=2,s=>s.appearance.fight='url(https://bad)',s=>s.audio.volume=101,s=>s.humor.photoDuration=0,s=>s.phrases.push({...s.phrases[0]}),s=>s.phrases[0].text=' ',s=>s.training.fight='300',s=>s.audio.enabled='true'];
  for (const change of bad) { const s=defaults(); change(s); assert.throws(()=>validateSettings(s)); }
});

test('não repete foto entre descansos curtos que não exibiram toda a sequência', () => {
  const s=defaults(); s.humor.photosPerRest=2;
  const photos=[{id:'a',enabled:true},{id:'b',enabled:true}], playlist=new RestPlaylist();
  const first=playlist.frame('rest1',0,s,photos);
  const next=playlist.frame('rest2',0,s,photos);
  assert.notEqual(first.photo.id,next.photo.id);
});

test('configurações antigas sem Modo Música são migradas preservando treino e frases', () => {
  const legacy=defaults(); delete legacy.audio.musicCompatibility;
  const migrated=validateSettings(legacy);
  assert.equal(migrated.audio.musicCompatibility,true);
  assert.deepEqual(migrated.training,legacy.training);
  assert.deepEqual(migrated.phrases,legacy.phrases);
});
