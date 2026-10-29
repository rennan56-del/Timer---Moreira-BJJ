import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenAwake } from '../dist/src/media/wake-lock.js';
function environment(wakeLock) {
  globalThis.document={hidden:false};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:wakeLock ? {wakeLock} : {}});
}
test('wake lock solicita apenas durante treino e libera ao pausar',async()=>{
  let calls=0,releases=0,listener;
  const lock={released:false,async release(){releases++;this.released=true;listener?.();},addEventListener(_,cb){listener=cb;}};
  environment({request:async()=>{calls++;return lock;}});
  let message; const screen=new ScreenAwake(value=>message=value);
  await screen.set(true); await screen.set(true); assert.equal(calls,1); assert.equal(message,'Tela mantida ativa');
  await screen.set(false); assert.equal(releases,1); assert.equal(message,'Tela: proteção em espera');
});
test('wake lock ausente ou negado mostra orientação e não lança exceção',async()=>{
  let message; const screen=new ScreenAwake(value=>message=value);
  environment(); await screen.set(true); assert.match(message,/bloqueio automático/);
  environment({request:async()=>{throw new Error('denied')}}); await screen.set(true); assert.match(message,/bloqueio automático/);
});
test('wake lock pendente é liberado se o treino parar antes da resposta',async()=>{
  let resolve,release=0;
  environment({request:()=>new Promise(r=>resolve=r)});
  const screen=new ScreenAwake(()=>{}),pending=screen.set(true);
  await screen.set(false);
  resolve({release:async()=>{release++}}); await pending;
  assert.equal(release,1);
});
