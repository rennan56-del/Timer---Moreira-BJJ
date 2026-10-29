import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import { AppUpdates, APP_VERSION } from '../dist/src/media/app-updates.js';
const template = (await readFile(new URL('../scripts/sw-template.js',import.meta.url),'utf8')).replace('__VERSION__','test-version').replace('__ASSETS__','[]');
async function workerScenario(states,{nativeAvailable=true,nativeBusy=false}={}) {
  const handlers=new Map(),replies=[],complete=[];let skipped=0,queries=0;
  const clients=states.map((active,index)=>({id:String(index),url:`https://timer.test/app/${index}`,postMessage(data,ports){
    if(data.type==='WORKOUT_STATUS_REQUEST'){
      queries++;
      if(active!=='unknown')ports[0].postMessage({type:'WORKOUT_STATUS',nonce:data.nonce,active});
      ports[0].close();
    } else complete.push(data);
  }}));
  // A different application's uncontrolled window must not block this scope.
  clients.push({id:'outside',url:'https://timer.test/other/',postMessage(){throw Error('outside scope queried')}});
  const self={registration:{scope:'https://timer.test/app/'},location:{origin:'https://timer.test'},clients:{matchAll:async()=>clients,claim:async()=>{}},navigator:nativeAvailable?{locks:{request:async(_,__,callback)=>callback(nativeBusy?null:{})}}:{},skipWaiting:async()=>{skipped++;},addEventListener(type,handler){const list=handlers.get(type)||[];list.push(handler);handlers.set(type,list);}};
  vm.runInNewContext(template,{self,MessageChannel,URL,Math,Date,caches:{},fetch(){throw Error('unexpected fetch')},setTimeout:(callback,ms)=>setTimeout(callback,ms===1500?50:ms),clearTimeout});
  const pending=[];
  const event={data:{type:'APPLY_UPDATE',requestId:'request-1'},source:{postMessage:result=>replies.push(result)},waitUntil:promise=>pending.push(promise)};
  for(const handler of handlers.get('message')||[])handler(event);
  await Promise.all(pending);
  return {replies,skipped,queries,complete};
}
test('atualização: todos os clientes ociosos confirmam antes de skipWaiting',async()=>{
  const result=await workerScenario([false,false]);
  assert.equal(result.skipped,1);assert.equal(result.queries,2);
  assert.equal(result.replies[0].result,'approved');assert.equal(result.complete.length,2);
  assert.ok(result.complete.every(message=>message.approved===true));
});
test('atualização: treino ativo ou cliente sem resposta impede ativação',async()=>{
  for(const states of [[false,true],[false,'unknown']]){
    const result=await workerScenario(states,{nativeAvailable:false});
    assert.equal(result.skipped,0);assert.equal(result.replies[0].result,'blocked');
    assert.ok(result.complete.every(message=>message.approved===false));
  }
});
test('atualização: reserva nativa de treino impede ativação sem esperar o dono',async()=>{
  const result=await workerScenario([false],{nativeBusy:true});
  assert.equal(result.skipped,0);assert.equal(result.queries,0);assert.equal(result.replies[0].result,'blocked');
});
function helperEnvironment({waiting=true,online=true}={}) {
  const listeners=new Map(),notifications=[],posted=[];let reloads=0,checks=0,active=false,ready=0;
  const container={getRegistration:async()=>registration,addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(item=>item!==fn));}};
  const registration={waiting:waiting?{postMessage:message=>posted.push(message)}:null,installing:null,async update(){checks++;},addEventListener(){}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:online,serviceWorker:container}});
  globalThis.window={location:{reload(){reloads++;}}};
  const app=new AppUpdates({isTrainingActive:()=>active,notify:message=>notifications.push(message),onReady(){ready++;}});
  app.attach(registration);
  const emit=(type,event={})=>(listeners.get(type)||[]).forEach(listener=>listener(event));
  const reply=result=>emit('message',{data:{type:'UPDATE_RESULT',requestId:posted.at(-1)?.requestId,result}});
  return {app,registration,posted,notifications,emit,reply,setActive:value=>{active=value;},get checks(){return checks;},get reloads(){return reloads;},get ready(){return ready;}};
}
test('atualização: helper recusa treino em andamento ou pausado sem recarregar',async()=>{
  const state=helperEnvironment();
  try {state.setActive(true);await state.app.check();assert.equal(state.checks,0);assert.equal(state.reloads,0);assert.match(state.notifications.at(-1),/Finalize o treino/);}
  finally{state.app.dispose();}
});
test('atualização: só a própria solicitação aprovada pode recarregar',async()=>{
  const state=helperEnvironment();
  try{
    assert.equal(state.ready,1);state.emit('controllerchange');assert.equal(state.reloads,0);
    await state.app.check();assert.equal(state.posted.length,1);assert.equal(state.checks,1);
    state.emit('message',{data:{type:'UPDATE_RESULT',requestId:'another-tab',result:'approved'}});
    state.emit('controllerchange');assert.equal(state.reloads,0);
    state.reply('approved');assert.equal(state.reloads,1,'controller change before approval is safely remembered');
    state.emit('controllerchange');assert.equal(state.reloads,1);
  }finally{state.app.dispose();}
});
test('atualização: se o treino começou durante a verificação, preserva a página',async()=>{
  const state=helperEnvironment();
  try{
    await state.app.check();state.setActive(true);state.reply('approved');state.emit('controllerchange');
    assert.equal(state.reloads,0);assert.match(state.notifications.at(-1),/treino atual foi preservado/);
  }finally{state.app.dispose();}
});
test('atualização: cliente bloqueado, offline e falha de rede não apagam dados',async()=>{
  const blocked=helperEnvironment();
  try{await blocked.app.check();blocked.reply('blocked');blocked.emit('controllerchange');assert.equal(blocked.reloads,0);assert.match(blocked.notifications.at(-1),/Atualização adiada/);}
  finally{blocked.app.dispose();}
  const offline=helperEnvironment({online:false});
  try{await offline.app.check();assert.equal(offline.checks,0);assert.match(offline.notifications.at(-1),/offline/);}
  finally{offline.app.dispose();}
  const broken=helperEnvironment();broken.registration.update=async()=>{throw Error('offline')};
  try{await broken.app.check();assert.equal(broken.reloads,0);assert.match(broken.notifications.at(-1),/dados foram mantidos/);}
  finally{broken.app.dispose();}
});
test('atualização: versão atual e navegador sem Service Worker exibem orientação',async()=>{
  const current=helperEnvironment({waiting:false});
  try{await current.app.check();assert.match(current.notifications.at(-1),new RegExp(APP_VERSION.replaceAll('.','\\.')));assert.equal(current.reloads,0);}
  finally{current.app.dispose();}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  const notifications=[],app=new AppUpdates({isTrainingActive:()=>false,notify:message=>notifications.push(message)});
  try{await app.check();assert.match(notifications[0],/HTTPS ou localhost/);}
  finally{app.dispose();}
});
