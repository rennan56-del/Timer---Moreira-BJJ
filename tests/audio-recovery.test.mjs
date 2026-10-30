import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioSystem,audioClockAdvances} from '../dist/src/media/audio.js';
import {TimerEngine} from '../dist/src/core/timer.js';
import {SignalTracker} from '../dist/src/core/signals.js';
import {defaults} from '../dist/src/storage/settings.js';
function setup(options={}){
 const contexts=[];let blocked=false;
 class Context {
  _state='suspended';time=0;startedAt=Date.now();frozen=false;cycles=0;resumes=0;closed=0;tones=[];destination={};onstatechange=null;sinkId='existing-output';
  constructor(config){this.options=config;contexts.push(this)}
  get state(){return this._state}set state(v){this.time=this.currentTime;this.startedAt=Date.now();this._state=v;this.onstatechange?.()}
  get currentTime(){return this.time+(!this.frozen&&this._state==='running'?(Date.now()-this.startedAt)/1000:0)}
  resume(){this.resumes++;if(blocked)return Promise.reject(new Error('NotAllowedError'));this.state='running';return Promise.resolve()}
  suspend(){this.cycles++;this.state='suspended';return Promise.resolve()}
  close(){this.closed++;this.state='closed';return Promise.resolve()}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
  createOscillator(){const tone={starts:0,stops:0};this.tones.push(tone);return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){tone.starts++},stop(){tone.stops++}}}
 }
 globalThis.window={AudioContext:Context};const audio=new AudioSystem(options.probe || audioClockAdvances);
 return {audio,contexts,last:()=>contexts.at(-1),block:value=>blocked=value};
}
for(const state of ['suspended','interrupted'])test(`retorno automático recupera ${state} sem recriar contexto nem tocar sinais`,async()=>{
 const s=setup();await s.audio.enable();const old=s.last();s.audio.play('short',defaults().audio);old.state=state;
 const count=old.tones.length;assert.equal(s.audio.ready,false);
 assert.equal(await s.audio.recover({automatic:true}),true);assert.equal(s.last(),old);assert.equal(old.tones.length,count);assert.equal(s.audio.needsGesture,false);
});
test('running com relógio parado: faz ciclo e recria uma única vez; preserva sink exposto',async()=>{
 const s=setup();await s.audio.enable();const old=s.last();old.frozen=true;s.audio.markInterrupted();
 assert.equal(await s.audio.recover({automatic:true}),true);assert.equal(old.cycles,1);assert.equal(old.closed,1);assert.equal(s.contexts.length,2);assert.equal(s.last().options.sinkId,'existing-output');assert.equal(s.last().tones.length,0);
});
test('running com relógio avançando: retorno também renova saída por suspend/resume',async()=>{
 const s=setup();await s.audio.enable();const old=s.last();s.audio.markInterrupted();assert.equal(await s.audio.recover({automatic:true}),true);assert.equal(s.contexts.length,1);assert.equal(old.cycles,1);
});
test('bloqueio automático solicita gesto; um toque recria e retoma sem beep diagnóstico',async()=>{
 const s=setup();await s.audio.enable();s.audio.markInterrupted();s.block(true);assert.equal(await s.audio.recover({automatic:true}),false);assert.equal(s.audio.needsGesture,true);
 s.block(false);const pending=s.audio.recover();assert.equal(s.contexts.length,3,'context is created before the gesture callback yields');assert.ok(s.last().resumes>0);assert.equal(await pending,true);assert.equal(s.audio.needsGesture,false);assert.equal(s.contexts.flatMap(c=>c.tones).length,0);
});
test('dez ciclos de interrupção preservam um contexto e não acumulam vozes',async()=>{
 const s=setup();await s.audio.enable();for(let i=0;i<10;i++){s.audio.play('short',defaults().audio);s.audio.markInterrupted();s.last().state=i%2?'interrupted':'suspended';assert.equal(await s.audio.recover({automatic:true}),true)}
 assert.equal(s.contexts.length,1);assert.equal(s.last().tones.length,10);assert.ok(s.last().tones.every(t=>t.starts===1&&t.stops===2));
});
test('eventos simultâneos compartilham a mesma recuperação automática',async()=>{
 const s=setup();await s.audio.enable();s.audio.markInterrupted();const p=s.audio.recover({automatic:true}),q=s.audio.recover({automatic:true});assert.equal(p,q);assert.equal(await p,true);assert.equal(s.last().cycles,1);
});
test('nova suspensão invalida resultado atrasado; tentativa seguinte recupera sem sobrescrita',async()=>{
 let resolveProbe;const s=setup({probe:()=>new Promise(r=>resolveProbe=r)});await s.audio.enable();s.audio.markInterrupted();const p=s.audio.recover({automatic:true});await new Promise(r=>setTimeout(r,0));s.audio.markInterrupted();resolveProbe(true);assert.equal(await p,false);assert.equal(s.audio.ready,false);
 const q=s.audio.recover({automatic:true});await new Promise(r=>setTimeout(r,0));resolveProbe(true);assert.equal(await q,true);
});
test('gesto preempta resume automático pendente; resultado antigo não desabilita contexto novo',async()=>{
 const s=setup();await s.audio.enable();const old=s.last();const resume=old.resume.bind(old);let release;
 old.resume=()=>new Promise(r=>release=r);s.audio.markInterrupted();const stale=s.audio.recover({automatic:true});old.resume=resume;
 assert.equal(await s.audio.recover(),true);release();await stale;assert.equal(s.audio.ready,true);assert.equal(s.audio.needsGesture,false);
});
test('resume que nunca resolve tem prazo e permite uma tentativa limpa',async()=>{
 const s=setup();await s.audio.enable();s.audio.markInterrupted();s.last().resume=()=>new Promise(()=>{});
 assert.equal(await s.audio.recover({automatic:true}),true);assert.equal(s.contexts.length,2);
});
test('motor e rastreador independentes: recuperação não muda captura nem repete 3–2–1',async()=>{
 const s=setup();await s.audio.enable();let time=0;const engine=new TimerEngine({fight:10,rest:5,rounds:2,preparation:0},()=>time),signals=new SignalTracker();engine.start();time=7000;
 const cues=signals.update(engine.snapshot(),[],time);assert.equal(cues.filter(c=>c.cue==='short').length,1);for(const c of cues)s.audio.play(c.cue,defaults().audio);
 const before=engine.capture();s.audio.markInterrupted();await s.audio.recover({automatic:true});assert.deepEqual(engine.capture(),before);assert.deepEqual(signals.update(engine.snapshot(),[],time),[]);
 time=8000;assert.equal(signals.update(engine.snapshot(),[],time).filter(c=>c.cue==='short').length,1);
});
