import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, validateCapture } from '../dist/src/core/timer.js';
import { PROTOCOLS, protocolStage } from '../dist/src/core/protocols.js';
import { SignalTracker } from '../dist/src/core/signals.js';
import { saveSession, loadSession } from '../dist/src/storage/session.js';
const manual={fight:317,rest:43,rounds:6,preparation:3};
function setup(id){let time=0;const engine=new TimerEngine(manual,()=>time);engine.configureProtocol(id);return {engine,step(ms){time+=ms;return engine.tick();},now:()=>time};}
for(const [id,p] of Object.entries(PROTOCOLS)) {
 test(`protocolo ${id}: sequência completa, preparação e nenhum descanso final`,()=>{
  const {engine,step}=setup(id);
  assert.equal(engine.snapshot().status,'idle');assert.equal(engine.snapshot().remaining,p.fights[0]*1000);
  engine.start();assert.equal(engine.snapshot().remaining,3000);step(3000);
  let rests=0;
  for(let r=1;r<=p.fights.length;r++){
   let s=engine.snapshot();assert.equal(s.phase,'fight');assert.equal(s.round,r);assert.equal(s.remaining,p.fights[r-1]*1000);
   step(p.fights[r-1]*1000);
   if(r===p.fights.length){assert.equal(engine.snapshot().status,'finished');assert.equal(engine.snapshot().remaining,0);break;}
   s=engine.snapshot();assert.equal(s.phase,'rest');assert.equal(s.remaining,p.rests[r-1]*1000);rests++;step(p.rests[r-1]*1000);
  }
  assert.equal(rests,p.fights.length-1);assert.deepEqual(step(9999999),[]);
 });
 test(`protocolo ${id}: sinais 3–2–1 e zero em todas as fases, pausa e retomada sem duplicação`,()=>{
  const {engine,step,now}=setup(id);const tracker=new SignalTracker();engine.start();step(3000);
  for(let i=0;i<p.fights.length*2-1;i++){
   const duration=engine.snapshot().remaining;tracker.update(engine.snapshot(),[],now());
   step(duration-3000);assert.equal(tracker.update(engine.snapshot(),[],now()).filter(s=>s.cue==='short').length,1);
   engine.pause();step(2000);engine.resume();assert.equal(tracker.update(engine.snapshot(),[],now()).length,0);
   for(let j=0;j<2;j++){step(1000);assert.equal(tracker.update(engine.snapshot(),[],now()).filter(s=>s.cue==='short').length,1);}
   const events=step(1000);assert.equal(tracker.update(engine.snapshot(),events,now()).filter(s=>s.cue==='long').length,1);
   assert.equal(tracker.update(engine.snapshot(),[],now()).length,0);
  }
  assert.equal(engine.snapshot().status,'finished');
 });
 test(`protocolo ${id}: captura/recuperação suspensa e pausada preserva identidade e precisão`,()=>{
  const {engine,step}=setup(id);engine.start();step(3000+p.fights[0]*1000+p.rests[0]*1000+1234);
  const s=engine.snapshot();assert.equal(s.round,2);const capture=engine.capture();assert.equal(capture.protocol,id);
  const restored=new TimerEngine(manual,()=>0);restored.restore(capture,2500);assert.equal(restored.protocolId,id);assert.equal(restored.snapshot().remaining,s.remaining-2500);
  engine.pause();restored.restore(engine.capture(),99999999);assert.equal(restored.snapshot().status,'paused');assert.equal(restored.snapshot().remaining,s.remaining);
  restored.end();restored.configure(manual);assert.equal(restored.protocolId,undefined);assert.equal(restored.snapshot().remaining,317000);
 });
}
test('decrescentes: atraso atravessa luta de 8 min e usa duração real na de 6 min',()=>{
 const {engine,step}=setup('descending');engine.start();step((3+600+120+480+120)*1000+4321);
 assert.equal(engine.snapshot().round,3);assert.equal(engine.snapshot().phase,'fight');assert.equal(engine.snapshot().remaining,355679);
 const capture=engine.capture();capture.remaining=360001;assert.throws(()=>validateCapture(capture));
});
test('sequência: exatamente 7 intervalos de 30s; troca única e aluno correto',()=>{
 const {engine,step}=setup('drills-sequence');engine.start();step((3+4*60+3*30)*1000);
 assert.equal(engine.snapshot().round,4);assert.equal(engine.snapshot().phase,'rest');assert.equal(engine.snapshot().remaining,30000);
 assert.equal(protocolStage(engine.protocolId,'rest',4),'Troca de aluno');step(30000);
 assert.equal(engine.snapshot().round,5);assert.equal(protocolStage(engine.protocolId,'fight',5),'Aluno 2 · rodada 1/4');
 step((4*60+3*30)*1000);assert.equal(engine.snapshot().status,'finished');
});
test('protocolo salvo valida id/durações e mantém formato manual anterior compatível',()=>{
 const {engine}=setup('descending');const capture=engine.capture();assert.equal(validateCapture(capture).protocol,'descending');
 for(const corrupt of [c=>c.protocol='bad',c=>c.training.fight=5,c=>c.training.rest=5,c=>c.training.preparation=0]){const c=structuredClone(capture);corrupt(c);assert.throws(()=>validateCapture(c));}
 const plain=new TimerEngine(manual).capture();assert.equal(Object.hasOwn(validateCapture(plain),'protocol'),false);
 const map=new Map();const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 saveSession(storage,{version:1,mode:'bjj',run:'protocol',savedAt:100,capture});assert.equal(loadSession(storage,100).session.capture.protocol,'descending');
});
test('trocar treino ativo exige encerrar; reiniciar mantém protocolo e primeira duração',()=>{
 const {engine,step}=setup('descending');engine.start();assert.throws(()=>engine.configureProtocol('drills-1-1'));step(603000);
 engine.reset();assert.equal(engine.protocolId,'descending');assert.equal(engine.snapshot().remaining,600000);
});
