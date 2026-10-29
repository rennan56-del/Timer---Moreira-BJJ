import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../dist/src/core/timer.js';
import { SignalTracker } from '../dist/src/core/signals.js';
function setup(config = {}) {
  let now = 0;
  const timer = new TimerEngine({fight:5,rest:5,rounds:2,preparation:0,...config},()=>now);
  const signals = new SignalTracker();
  const update = (milliseconds = 0, options = {}) => {
    now += milliseconds;
    const events = timer.tick();
    return signals.update(timer.snapshot(),events,now,options);
  };
  return {timer,signals,update,time:()=>now,setTime:value=>{now=value;}};
}
test('luta e descanso emitem exatamente três curtos e um longo, derivados dos limiares reais',()=>{
  const {timer,update}=setup({rounds:1}); timer.start();
  assert.deepEqual(update().map(s=>s.cue),['start']);
  assert.deepEqual(update(1900),[]);
  assert.deepEqual(update(100).map(s=>s.cue),['short']);
  assert.deepEqual(update(100),[]);
  assert.deepEqual(update(900).map(s=>s.cue),['short']);
  assert.deepEqual(update(1000).map(s=>s.cue),['short']);
  assert.deepEqual(update(1000).map(s=>s.cue),['long']);
  assert.equal(timer.snapshot().status,'finished'); assert.deepEqual(update(1000),[]);
});
test('dez rounds completos: 19 fases cronometradas, 57 curtos e 19 longos, sem descanso final',()=>{
  const {timer,update}=setup({rounds:10}); timer.start(); const collected=[...update()];
  for(let i=0;i<95;i++) collected.push(...update(1000));
  assert.equal(timer.snapshot().status,'finished'); assert.equal(timer.snapshot().round,10);
  assert.equal(collected.filter(s=>s.cue==='short').length,57);
  assert.equal(collected.filter(s=>s.cue==='long').length,19);
  assert.equal(new Set(collected.map(s=>s.key)).size,collected.length);
});
test('preparação emite 3–2–1 e um único sinal de transição, sem start duplicado',()=>{
  const {timer,update}=setup({preparation:3}); timer.start();
  assert.deepEqual(update().map(s=>s.cue),['count']);
  assert.deepEqual(update(1000).map(s=>s.cue),['count']);
  assert.deepEqual(update(1000).map(s=>s.cue),['count']);
  assert.deepEqual(update(1000).map(s=>s.cue),['long']);
  assert.deepEqual(update(100),[]);
});
test('pausa/retomada não repete bip já consumido nem altera os próximos limiares',()=>{
  const {timer,signals,update,time}=setup({rounds:1}); timer.start(); update();
  assert.deepEqual(update(2000).map(s=>s.cue),['short']);
  timer.pause(); signals.update(timer.snapshot(),[],time());
  assert.deepEqual(update(10000),[]);
  timer.resume(); assert.deepEqual(update(),[]);
  assert.deepEqual(update(1000).map(s=>s.cue),['short']);
  assert.deepEqual(update(1000).map(s=>s.cue),['short']);
  assert.deepEqual(update(1000).map(s=>s.cue),['long']);
});
test('sinais ocultos ou silenciados são consumidos e nunca recuperados em sequência',()=>{
  const {timer,update}=setup({rounds:1}); timer.start(); update();
  assert.deepEqual(update(2000,{silent:true}),[]);
  assert.deepEqual(update(),[]);
  assert.deepEqual(update(1000).map(s=>s.cue),['short']);
  assert.deepEqual(update(1000,{silent:true}),[]);
  assert.deepEqual(update(1000,{silent:true}),[]);
  assert.deepEqual(update(),[]);
});
test('atraso atravessando limiares não reproduz bipes antigos ou todas as sirenes anteriores',()=>{
  const {timer,update}=setup(); timer.start(); update();
  assert.deepEqual(update(4300).map(s=>s.cue),['short']); // only the current final second
  assert.deepEqual(update(700).map(s=>s.cue),['long']);
  assert.deepEqual(update(9000).map(s=>s.cue),['short']); // old long is skipped; current second remains valid
});
test('seed na restauração/retorno descarta o segundo atual sem bloquear os próximos',()=>{
  const {timer,signals,update}=setup({rounds:1}); timer.start(); update();
  // The OS prevented execution; restore at three seconds remaining.
  const snapshot={...timer.snapshot(),remaining:2800,elapsed:2200};
  signals.seed(snapshot);
  assert.deepEqual(signals.update(snapshot,[],2200),[]);
  const next={...snapshot,remaining:2000,elapsed:3000};
  assert.deepEqual(signals.update(next,[],3000).map(s=>s.cue),['short']);
});
test('fase curta de três segundos preserva curto inicial mesmo coincidindo com longo anterior',()=>{
  const {timer,update}=setup({fight:3,rest:3,rounds:2}); timer.start();
  assert.deepEqual(update().map(s=>s.cue),['short']);
  update(1000); update(1000);
  const boundary=update(1000);
  assert.deepEqual(boundary.map(s=>s.cue),['long','short']);
  assert.notEqual(boundary[0].key,boundary[1].key);
});
test('reset permite treino novo; updates duplicados de uma transição não duplicam sinal',()=>{
  const {timer,signals,update,time}=setup({rounds:1}); timer.start(); update();
  update(4000);
  const transition={from:'fight',to:'finished',round:1,at:5000};
  const finish={...timer.snapshot(),status:'finished',remaining:0};
  assert.equal(signals.update(finish,[transition],5000).length,1);
  assert.equal(signals.update(finish,[transition],5000).length,0);
  timer.reset(); signals.reset(); timer.start();
  assert.deepEqual(update().map(s=>s.cue),['start']);
});
