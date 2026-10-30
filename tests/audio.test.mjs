import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem, SIGNAL_PEAK_BUDGET } from '../dist/src/media/audio.js';
import { defaults } from '../dist/src/storage/settings.js';
class MockAudioContext {
  state='suspended'; currentTime=0; destination={}; started=0; stopped=0; tones=[]; gains=[];
  async resume(){this.state='running';}
  createOscillator(){
    const ctx=this,tone={start:0,stop:0,frequency:0,type:'sine',stops:0}; ctx.tones.push(tone);
    return {frequency:{setValueAtTime(value){tone.frequency=value},exponentialRampToValueAtTime(){}},connect(gain){tone.gain=gain},disconnect(){},
      set type(value){tone.type=value},setPeriodicWave(wave){tone.type='custom';tone.wave=wave;},start(value){ctx.started++;tone.start=value},stop(value){ctx.stopped++;tone.stops++;tone.stop=value}};
  }
  createPeriodicWave(real,imaginary,options){return {real:Array.from(real),imaginary:Array.from(imaginary),options};}
  createGain(){
    const node={events:[],gain:{},connect(){},disconnect(){}};
    for(const method of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime']) node.gain[method]=(value,at)=>node.events.push({method,value,at});
    this.gains.push(node); return node;
  }
}
function setup(){
  let context; globalThis.window={AudioContext:class extends MockAudioContext{constructor(){super();context=this;}}};
  const audio=new AudioSystem(async()=>true); return {audio,context:()=>context,settings:{...defaults().audio,volume:65,musicCompatibility:false}};
}
test('áudio aguarda gesto, respeita opções e dá prioridade aos sinais do treino (mock)',async()=>{
  const {audio,context,settings:s}=setup(); s.funny=true;
  assert.equal(audio.ready,false); assert.equal(audio.state,'not-initialized'); assert.equal(audio.play('start',s),false);
  assert.equal(await audio.enable(),true); assert.equal(audio.play('start',s),true);
  const count=context().started; assert.equal(audio.play('funny',s),false); assert.equal(audio.play('ten',s),false); assert.equal(context().started,count);
  context().currentTime=2; assert.equal(audio.play('funny',s),true);
  assert.equal(audio.play('end',s),true); assert.ok(context().stopped>0);
  assert.equal(audio.play('start',{...s,enabled:false}),false);
  assert.equal(audio.play('start',{...s,sirens:false}),false);
  assert.equal(audio.play('ten',{...s,lastTen:false}),false);
  assert.equal(audio.play('count',{...s,countdown:false}),false);
  assert.equal(audio.play('return',{...s,returnCue:false}),false);
});
test('curtos e prolongados são distintos; três curtos não são bloqueados por sinais importantes',async()=>{
  const {audio,context,settings:s}=setup(); await audio.enable();
  audio.play('long',s); const prolonged=context().tones.at(-1);
  assert.equal(audio.play('short',s),true); const short=context().tones.at(-1);
  assert.ok(prolonged.stop-prolonged.start>.85); assert.ok(short.stop-short.start<.3);
  assert.notEqual(prolonged.frequency,short.frequency);
  assert.equal(prolonged.stops,1,'long was not stopped a second time by short');
  context().currentTime=1; assert.equal(audio.play('short',s),true);
  context().currentTime=2; assert.equal(audio.play('short',s),true);
});
test('sinais finais obrigatórios respeitam silêncio/volume, independentemente de avisos opcionais',async()=>{
  const {audio,settings:s}=setup(); await audio.enable();
  assert.equal(audio.play('short',{...s,countdown:false}),true);
  assert.equal(audio.play('long',{...s,sirens:false}),true);
  assert.equal(audio.play('short',{...s,volume:0}),false);
  assert.equal(audio.play('long',{...s,enabled:false}),false);
});
test('modo música preserva sinais harmônicos breves e evita efeitos cômicos não essenciais',async()=>{
  const {audio,context,settings:s}=setup(); await audio.enable();
  const music={...s,musicCompatibility:true,funny:true};
  assert.equal(audio.play('funny',music),false); assert.equal(context().started,0);
  assert.equal(audio.play('test-short',music),true);
  assert.equal(audio.play('test-long',music),true);
  assert.ok(context().tones.every(tone=>tone.type==='custom'));
  assert.ok(context().tones.every(tone=>tone.stop-tone.start<1.1));
});
test('reativar contexto suspenso reutiliza contexto; contexto fechado pode ser recriado',async()=>{
  const {audio,context}=setup(); await audio.enable(); const original=context();
  audio.play('long',{...defaults().audio,musicCompatibility:true});
  const oldTone=original.tones.at(-1);
  original.state='suspended'; assert.equal(await audio.recover(),true); assert.equal(context(),original);
  assert.equal(oldTone.stops,2,'frozen tones are discarded before context resume');
  original.state='closed'; assert.equal(await audio.recover(),true); assert.notEqual(context(),original);
});
test('falha de resume e ausência de Web Audio são tratadas',async()=>{
  globalThis.window={}; const unsupported=new AudioSystem(async()=>true); assert.equal(await unsupported.enable(),false); assert.match(unsupported.lastError,/disponível/);
  globalThis.window={AudioContext:class extends MockAudioContext{async resume(){throw new Error('NotAllowedError')}}};
  const denied=new AudioSystem(async()=>true); assert.equal(await denied.enable(),false); assert.ok(denied.lastError);
});
test('saída com falha não lança exceção no cronômetro',async()=>{
  const {audio,context,settings}=setup(); await audio.enable();
  context().createOscillator=()=>{throw new Error('device removed')};
  assert.equal(audio.play('short',settings),false); assert.match(audio.lastError,/saída de áudio/);
});

const peakOf=tone=>Math.max(...tone.gain.events.map(event=>event.value));
test('Normal e Academia têm timbres distintos, ataque rápido e duração prolongada marcante',async()=>{
  const normal=setup(); await normal.audio.enable();
  normal.audio.play('short',{...normal.settings,volume:65});
  normal.audio.play('long',{...normal.settings,volume:65});
  const [normalShort,normalLong]=normal.context().tones;
  const gym=setup(); await gym.audio.enable();
  gym.audio.play('short',{...gym.settings,volume:100});
  gym.audio.play('long',{...gym.settings,volume:100});
  const [gymShort,gymLong]=gym.context().tones;
  assert.ok(peakOf(gymShort)>peakOf(normalShort));
  assert.notEqual(normalShort.frequency,gymShort.frequency);
  assert.notEqual(normalLong.frequency,gymLong.frequency);
  assert.ok(Math.abs(normalShort.stop-normalShort.start-.195)<.001);
  assert.ok(Math.abs(normalLong.stop-normalLong.start-.915)<.001);
  assert.ok(Math.abs(gymShort.stop-gymShort.start-.245)<.001);
  assert.ok(Math.abs(gymLong.stop-gymLong.start-1.065)<.001);
  assert.ok(gymShort.gain.events.some(event=>event.method==='linearRampToValueAtTime'&&event.value===peakOf(gymShort)&&event.at<=.0021));
  assert.ok(gymLong.gain.events.some(event=>event.method==='setValueAtTime'&&event.value===peakOf(gymLong)&&event.at>=1.02));
});
test('compatibilidade com música não reduz potência ou duração do perfil Academia',async()=>{
  const off=setup(); await off.audio.enable();
  off.audio.play('short',{...off.settings,volume:100,musicCompatibility:false});
  off.audio.play('long',{...off.settings,volume:100,musicCompatibility:false});
  const on=setup(); await on.audio.enable();
  on.audio.play('short',{...on.settings,volume:100,musicCompatibility:true});
  on.audio.play('long',{...on.settings,volume:100,musicCompatibility:true});
  assert.deepEqual(on.context().tones.map(t=>({frequency:t.frequency,type:t.type,length:t.stop-t.start,peak:peakOf(t)})),off.context().tones.map(t=>({frequency:t.frequency,type:t.type,length:t.stop-t.start,peak:peakOf(t)})));
});
test('orçamento global de pico fica em 0.9 inclusive com oito sinais sobrepostos',async()=>{
  const {audio,context,settings}=setup(); await audio.enable();
  for(let i=0;i<8;i++){
    assert.equal(audio.play(i%2?'short':'long',{...settings,volume:100}),true);
    const sum=context().tones.reduce((peak,tone)=>peak+peakOf(tone),0);
    const master=context().gains[0].events.at(-1).value;
    assert.ok(sum*master<=SIGNAL_PEAK_BUDGET+1e-10);
    assert.ok(master>0&&master<=1);
  }
  assert.equal(context().started,8);
});
test('Silencioso, zero e valores inválidos não criam osciladores; amplitude excedente é limitada',async()=>{
  const {audio,context,settings}=setup(); await audio.enable();
  for(const value of [0,-1,NaN,Infinity]) assert.equal(audio.play('short',{...settings,volume:value}),false);
  assert.equal(audio.play('long',{...settings,enabled:false,volume:100}),false);
  assert.equal(context().started,0);
  assert.equal(audio.play('short',{...settings,volume:999}),true);
  assert.equal(peakOf(context().tones.at(-1)),.88);
});

test('reativação recupera falha transitória ao criar a saída compartilhada',async()=>{
  let context,failed=false;
  globalThis.window={AudioContext:class extends MockAudioContext{
    constructor(){super();context=this;}
    createGain(){if(!failed){failed=true;throw new Error('temporary route failure')}return super.createGain();}
  }};
  const audio=new AudioSystem(async()=>true);
  assert.equal(await audio.enable(),false);
  assert.equal(await audio.recover(),true);
  assert.equal(audio.play('short',{...defaults().audio,volume:65}),true);
  assert.equal(context.started,1);
});

test('buzzer agudo tem harmônicos ímpares normalizados e mantém um oscilador por sinal',async()=>{
  const {audio,context,settings}=setup(); await audio.enable();
  assert.equal(audio.play('short',{...settings,volume:100}),true);
  assert.equal(audio.play('long',{...settings,volume:100}),true);
  assert.equal(context().started,2);
  const [short,long]=context().tones;
  assert.equal(short.type,'custom'); assert.equal(long.type,'custom');
  assert.equal(short.frequency,2400); assert.equal(long.frequency,1080);
  assert.equal(short.wave.options.disableNormalization,false);
  for(const harmonic of [1,3,5,7]) assert.ok(Math.abs(short.wave.imaginary[harmonic]-1/harmonic)<1e-6);
  for(const harmonic of [0,2,4,6]) assert.equal(short.wave.imaginary[harmonic],0);
  assert.equal(peakOf(short),.88);
  // Unit-peak PeriodicWave plus sum-of-peaks master budget prevents app clipping.
  assert.ok((peakOf(short)+peakOf(long))*context().gains[0].events.at(-1).value<=SIGNAL_PEAK_BUDGET+1e-10);
});
test('fallback sem PeriodicWave usa onda quadrada sem interromper o treino',async()=>{
  const {audio,context,settings}=setup(); await audio.enable();
  context().createPeriodicWave=undefined;
  assert.equal(audio.play('short',{...settings,volume:100}),true);
  assert.equal(context().tones[0].type,'square');
});
