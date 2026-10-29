import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, validateCapture } from '../dist/src/core/timer.js';
import { saveSession, loadSession, clearSession, MAX_SESSION_AGE, SESSION_KEY } from '../dist/src/storage/session.js';
import { WorkoutLock, WORKOUT_LOCK_KEY } from '../dist/src/core/session-lock.js';
const training={fight:300,rest:180,rounds:10,preparation:3};
function fakeStorage(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function makeEngine(){let time=0;const engine=new TimerEngine(training,()=>time);return {engine,step:delta=>{time+=delta;return engine.tick();},set:value=>time=value};}
test('10 rounds automáticos: nove descansos, sinal final e parada no décimo round',()=>{
  const {engine,step}=makeEngine();engine.start();
  const events=step((3+10*300+9*180)*1000);
  assert.equal(events.filter(e=>e.to==='rest').length,9);
  assert.equal(events.filter(e=>e.to==='fight').length,10);
  assert.equal(events.at(-1).to,'finished');
  assert.equal(engine.snapshot().status,'finished'); assert.equal(engine.snapshot().round,10);
  assert.equal(step(180000).length,0);
});
test('captura e recuperação atravessam rounds sem consumir transições durante gravação',()=>{
  const source=makeEngine();source.engine.start();source.set(305000);
  const capture=source.engine.capture();
  assert.equal(capture.phase,'preparation');assert.equal(capture.remaining,-302000);
  assert.equal(source.engine.tick().length,2);
  const restored=new TimerEngine({fight:1,rest:0,rounds:1,preparation:0},()=>100);
  restored.restore(capture,180000);
  assert.equal(restored.snapshot().phase,'fight');assert.equal(restored.snapshot().round,2);
  assert.equal(restored.snapshot().remaining,298000);
  assert.equal(restored.tick().length,0,'restoration does not leave old transitions queued');
});
test('pausa persistida ignora o tempo fora da página; retomada preserva fração',()=>{
  const source=makeEngine();source.engine.start();source.step(15555);source.engine.pause();
  let time=10;const restored=new TimerEngine(training,()=>time);
  restored.restore(source.engine.capture(),600000);
  assert.equal(restored.snapshot().status,'paused');assert.equal(restored.snapshot().remaining,287445);
  restored.resume();time+=1234;restored.tick();assert.equal(restored.snapshot().remaining,286211);
});
test('restaurar treino terminado mantém encerramento e capturas inválidas são rejeitadas',()=>{
  const source=makeEngine();source.engine.start();source.step(999999999);
  const restored=new TimerEngine(training);restored.restore(source.engine.capture(),123456);
  assert.equal(restored.snapshot().status,'finished');assert.equal(restored.snapshot().round,10);
  const valid=source.engine.capture();
  for(const change of [c=>c.round=0,c=>c.training.rounds=0,c=>c.remaining=NaN,c=>c.phase='rest',c=>c.status='broken',c=>c.revision=-1]){
    const capture=structuredClone(valid);change(capture);assert.throws(()=>validateCapture(capture));
  }
  assert.throws(()=>restored.restore(valid,-1));
});
test('treino e modo persistem; sessão inválida, futura ou antiga não quebra inicialização',()=>{
  const storage=fakeStorage(),{engine,step}=makeEngine();engine.start();step(1000);
  const session={version:1,mode:'bjj',run:'run-1',savedAt:10000,capture:engine.capture()};
  saveSession(storage,session);
  const loaded=loadSession(storage,15000);assert.deepEqual(loaded.session,session);assert.equal(loaded.elapsedMs,5000);
  engine.pause();saveSession(storage,{...session,capture:engine.capture()});assert.equal(loadSession(storage,15000).elapsedMs,0);
  assert.ok(loadSession(storage,10000+MAX_SESSION_AGE+1).warning);
  assert.ok(loadSession(storage,-60000).warning);
  storage.setItem(SESSION_KEY,'not json');assert.ok(loadSession(storage,15000).warning);
  clearSession(storage);assert.deepEqual(loadSession(storage,15000),{});
  assert.ok(loadSession({getItem(){throw Error('denied')}}).warning);
});
function nativeLocks(){
  let held=false;
  return {async request(name,options,callback){if(held)return callback(null);held=true;try{await callback({name});}finally{held=false;}}};
}
test('Web Locks impede dois timers e libera quando a sessão termina',async()=>{
  const provider=nativeLocks(),first=new WorkoutLock({locks:provider}),second=new WorkoutLock({locks:provider});
  assert.equal(await first.acquire(),true);assert.equal(await first.acquire(),true);assert.equal(first.owned,true);
  assert.equal(await second.acquire(),false);assert.match(second.reason,/outra aba/);
  assert.equal(await second.recoverFallback(),false,'native lock is never overridden');
  first.release();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(await second.acquire(),true);assert.equal(second.owned,true);second.release();
});
test('fallback não rouba reserva de uma aba suspensa, mesmo com heartbeat antigo',async()=>{
  const storage=fakeStorage();let time=1000;
  const options={storage,locks:null,now:()=>time,heartbeatMs:100000,settleMs:0};
  const first=new WorkoutLock({...options,owner:'first'}),second=new WorkoutLock({...options,owner:'second'});
  assert.equal(await first.acquire(),true);time+=99999999;
  assert.equal(await second.acquire(),false);assert.equal(first.owned,true);assert.equal(second.canRecoverFallback,true);
  assert.equal(await second.recoverFallback(),true,'only explicit recovery replaces the stale owner');
  assert.equal(first.owned,false);assert.equal(second.owned,true);
  first.release();assert.equal(second.owned,true,'displaced old owner cannot release new owner');
  second.release();assert.equal(storage.getItem(WORKOUT_LOCK_KEY),null);
});
test('fallback verifica o fence antes de emitir; storage negado falha de forma segura',async()=>{
  const storage=fakeStorage(),lock=new WorkoutLock({storage,locks:null,owner:'one',settleMs:0});
  assert.equal(await lock.acquire(),true);
  storage.setItem(WORKOUT_LOCK_KEY,JSON.stringify({version:1,owner:'two',heartbeat:Date.now()}));
  assert.equal(lock.owned,false);lock.release();assert.ok(storage.getItem(WORKOUT_LOCK_KEY).includes('two'));
  const denied=new WorkoutLock({locks:null,storage:{getItem(){throw Error('denied')},setItem(){throw Error('denied')}}});
  assert.equal(await denied.acquire(),false);assert.equal(denied.owned,false);
  const absent=new WorkoutLock({locks:null,storage:undefined});assert.equal(await absent.acquire(),false);
});
test('aquisição de fallback simultânea permite somente o vencedor verificado',async()=>{
  const storage=fakeStorage(),options={locks:null,storage,settleMs:10};
  const a=new WorkoutLock({...options,owner:'a'}),b=new WorkoutLock({...options,owner:'b'});
  const acquired=await Promise.all([a.acquire(),b.acquire()]);assert.equal(acquired.filter(Boolean).length,1);
  assert.equal([a.owned,b.owned].filter(Boolean).length,1);a.release();b.release();
});

test('recuperação explícita repara reserva corrompida sem contornar Web Locks',async()=>{
  const storage=fakeStorage();storage.setItem(WORKOUT_LOCK_KEY,'broken json');
  const lock=new WorkoutLock({storage,locks:null,settleMs:0});
  assert.equal(await lock.acquire(),false);assert.equal(lock.canRecoverFallback,true);
  assert.equal(await lock.recoverFallback(),true);assert.equal(lock.owned,true);lock.release();
});

test('reativar a mesma instância espera a liberação nativa real após pagehide',async()=>{
  let held=false,requests=0,unavailable=0,completeRelease;
  let releaseQueuedResolve;
  let releaseQueued=new Promise(resolve=>releaseQueuedResolve=resolve);
  const provider={async request(name,options,callback){
    requests++;
    if(held){unavailable++;return callback(null);}
    held=true;
    await callback({name});
    // Native release happens in a later task; exposing its completion makes
    // this regression deterministic, without waiting an arbitrary duration.
    await new Promise(resolve=>{
      completeRelease=()=>{held=false;resolve();};
      releaseQueuedResolve();
    });
  }};
  const first=new WorkoutLock({locks:provider}),foreign=new WorkoutLock({locks:provider});
  assert.equal(await first.acquire(),true);
  first.release();
  const returning=first.acquire();
  await releaseQueued;
  assert.equal(requests,1,'same instance has not queried a still-held native lock');
  assert.equal(first.owned,false);
  completeRelease();
  assert.equal(await returning,true);
  assert.equal(requests,2);assert.equal(unavailable,0);
  assert.equal(await foreign.acquire(),false,'a genuine foreign owner still fails immediately');
  assert.equal(unavailable,1);
  releaseQueued=new Promise(resolve=>releaseQueuedResolve=resolve);
  first.release();await releaseQueued;completeRelease();
});
