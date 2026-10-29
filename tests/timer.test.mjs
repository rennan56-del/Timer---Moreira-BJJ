import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, formatTime, validateTraining } from '../dist/src/core/timer.js';
import { TrainingClock } from '../dist/src/core/clock.js';
const config = { fight:300, rest:60, rounds:5, preparation:3 };
function setup(options = {}) {
  let time = 0;
  const engine = new TimerEngine({ ...config, ...options }, () => time);
  return { engine, set: value => { time = value; }, step: delta => { time += delta; return engine.tick(); } };
}
test('1. inicia idle, preparação e primeira luta nos instantes corretos', () => {
  const { engine,step } = setup();
  assert.equal(engine.snapshot().status,'idle'); assert.equal(engine.snapshot().remaining,300000);
  engine.start(); assert.equal(engine.snapshot().phase,'preparation'); assert.equal(engine.snapshot().remaining,3000);
  step(2999); assert.equal(engine.snapshot().phase,'preparation');
  const events=step(1); assert.deepEqual(events,[{from:'preparation',to:'fight',round:1,at:3000}]);
  assert.equal(engine.snapshot().remaining,300000);
});
test('2. pausa e retomada preservam os milissegundos restantes', () => {
  const { engine,step } = setup({preparation:0}); engine.start(); step(15234); engine.pause();
  assert.equal(engine.snapshot().remaining,284766); step(600000);
  assert.equal(engine.snapshot().remaining,284766); engine.resume(); step(14234);
  assert.equal(engine.snapshot().remaining,270532); assert.equal(engine.snapshot().status,'running');
});
test('3/4. luta → descanso → próximo round, sem descanso final', () => {
  const { engine,step }=setup({fight:5,rest:2,rounds:2,preparation:0}); engine.start();
  step(5000); assert.equal(engine.snapshot().phase,'rest'); assert.equal(engine.snapshot().round,1);
  step(2000); assert.equal(engine.snapshot().phase,'fight'); assert.equal(engine.snapshot().round,2);
  const events=step(5000); assert.equal(events[0].to,'finished'); assert.equal(engine.snapshot().status,'finished');
});
test('5. conclusão automática de todos os rounds com callback atrasado', () => {
  const { engine,step }=setup(); engine.start(); const events=step(1743000);
  assert.equal(events.length,10); assert.equal(engine.snapshot().status,'finished');
  assert.equal(engine.snapshot().round,5); assert.equal(engine.snapshot().remaining,0);
});
test('6. preparação configurável ou desligada', () => {
  for (const preparation of [0,1,3,60]) {
    const {engine,step}=setup({preparation}); engine.start();
    assert.equal(engine.snapshot().phase,preparation ? 'preparation' : 'fight');
    if (preparation) { step(preparation*1000); assert.equal(engine.snapshot().phase,'fight'); }
  }
});
test('13. suspensão: recupera a fase, round e fração correta sem acumular atraso', () => {
  const {engine,step}=setup({fight:5,rest:2,rounds:10,preparation:3}); engine.start();
  step(37123); assert.equal(engine.snapshot().phase,'rest'); assert.equal(engine.snapshot().round,5);
  assert.equal(engine.snapshot().remaining,877);
  step(877); assert.equal(engine.snapshot().phase,'fight'); assert.equal(engine.snapshot().round,6);
  assert.equal(engine.snapshot().remaining,5000);
});
test('callbacks irregulares não acumulam drift', () => {
  const {engine,step}=setup({preparation:0}); engine.start();
  let elapsed=0;
  for (const delta of [333,1256,82,15999,20117,21005,523,14,2012]) { elapsed+=delta; step(delta); assert.equal(engine.snapshot().remaining,300000-elapsed); }
});
test('compensa relógio monotônico congelado durante suspensão do SO', () => {
  let mono=1000,wall=100000;
  const clock=new TrainingClock(()=>mono,()=>wall);
  const engine=new TimerEngine({fight:5,rest:2,rounds:3,preparation:0},clock.now);
  engine.start(); mono+=1000; wall+=1000; engine.tick(); clock.checkpoint();
  wall+=9000; clock.reconcile(); engine.tick();
  assert.equal(engine.snapshot().round,2); assert.equal(engine.snapshot().phase,'fight'); assert.equal(engine.snapshot().remaining,2000);
});
test('reconciliação não conta o sono duas vezes nem inclui pausa', () => {
  let mono=0,wall=0; const clock=new TrainingClock(()=>mono,()=>wall);
  const engine=new TimerEngine(config,clock.now); engine.start();
  mono=10000; wall=10000; clock.reconcile(); engine.tick(); assert.equal(engine.snapshot().remaining,293000);
  engine.pause(); clock.checkpoint(); wall+=60000; clock.reconcile(); engine.resume();
  assert.equal(engine.snapshot().remaining,293000);
  clock.reconcile(); engine.tick(); assert.equal(engine.snapshot().remaining,293000);
});
test('ignora ajustes regressivos de relógio civil', () => {
  let mono=0,wall=0; const clock=new TrainingClock(()=>mono,()=>wall);
  mono=5000; wall=-500000; clock.reconcile(); assert.equal(clock.now(),5000);
});
test('pular descanso, avançar preparação e round em pausa', () => {
  const {engine,step}=setup({fight:5,rest:2,rounds:2}); engine.start(); engine.advance();
  assert.equal(engine.snapshot().phase,'fight'); engine.advance(); assert.equal(engine.snapshot().phase,'rest');
  engine.pause(); step(10000); engine.advance();
  assert.equal(engine.snapshot().status,'paused'); assert.equal(engine.snapshot().round,2); assert.equal(engine.snapshot().remaining,5000);
  engine.resume(); engine.advance(); assert.equal(engine.snapshot().status,'finished');
});
test('zero descanso: próximo round imediato, com limite de rounds respeitado', () => {
  const {engine,step}=setup({fight:1,rest:0,preparation:0,rounds:999}); engine.start();
  const events=step(999000); assert.equal(events.length,999); assert.equal(engine.snapshot().status,'finished');
});
test('encerrar e reiniciar limpam o treino; start repetido não reinicia', () => {
  const {engine,step}=setup(); engine.start(); step(5000); const remaining=engine.snapshot().remaining;
  engine.start(); assert.equal(engine.snapshot().remaining,remaining);
  engine.end(); assert.equal(engine.snapshot().status,'ended');
  engine.reset(); assert.equal(engine.snapshot().status,'idle'); assert.equal(engine.snapshot().remaining,300000);
});
test('pausar exatamente na conclusão não reabre treino', () => {
  const {engine,set}=setup({rounds:1,preparation:0}); engine.start(); set(300000); engine.pause();
  assert.equal(engine.snapshot().status,'finished'); engine.resume(); assert.equal(engine.snapshot().status,'finished');
});
test('configurações inválidas e alterações no meio do treino são rejeitadas', () => {
  for (const bad of [{fight:0},{fight:NaN},{rounds:0},{rounds:1.5},{rest:-1},{preparation:61},{fight:Infinity}]) assert.throws(()=>validateTraining({...config,...bad}));
  const {engine}=setup(); engine.start(); assert.throws(()=>engine.configure(config));
  engine.end(); engine.configure({...config,fight:60}); assert.equal(engine.snapshot().remaining,60000);
});
test('formata arredondamento, limites e tempos longos sem truncar', () => {
  assert.equal(formatTime(0),'00:00'); assert.equal(formatTime(-1),'00:00'); assert.equal(formatTime(1),'00:01');
  assert.equal(formatTime(60001),'01:01'); assert.equal(formatTime(3600000),'60:00'); assert.equal(formatTime(86400000),'1440:00');
});

test('reconcilia suspensão curta de 500 ms, tolerando só ruído de até 50 ms', () => {
  let mono=0,wall=0; const clock=new TrainingClock(()=>mono,()=>wall);
  const engine=new TimerEngine({fight:1,rest:0,rounds:1,preparation:0},clock.now);
  engine.start(); mono=500; wall=1000; clock.reconcile(); engine.tick();
  assert.equal(engine.snapshot().status,'finished');
  mono=600; wall=1102; clock.reconcile(); assert.equal(clock.now(),1100);
});
