"""Web Audio interruption fault injection in Chromium. No physical iPhone/Roku tests."""
from pathlib import Path
import os,json,subprocess,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
results=[]
def ok(name):results.append(name);print('PASS:',name,flush=True)
FAULTS='''(()=>{
 const Native=window.AudioContext;window.__audioContexts=[];window.__audioTones=[];window.__blockAudio=false;window.__hidden=false;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});
 class FaultContext extends Native {
  constructor(...args){super(...args);this.fault='';this.cycles=0;this.resumes=0;window.__audioContexts.push(this)}
  get state(){return window.__blockAudio || ['suspended','interrupted'].includes(this.fault)?(this.fault==='interrupted'?'interrupted':'suspended'):super.state}
  get currentTime(){return this.fault==='frozen'?0:super.currentTime}
  resume(){this.resumes++;if(window.__blockAudio)return Promise.reject(new DOMException('gesture required','NotAllowedError'));if(this.fault==='suspended'||this.fault==='interrupted')this.fault='';return super.resume()}
  suspend(){this.cycles++;return super.suspend()}
  createOscillator(){const oscillator=super.createOscillator(),start=oscillator.start.bind(oscillator);oscillator.start=(when)=>{window.__audioTones.push({context:window.__audioContexts.indexOf(this),when});return start(when)};return oscillator}
 }
 window.AudioContext=FaultContext;
 const base=Date.now();window.__time=0;performance.now=()=>window.__time;Date.now=()=>base+window.__time;
 window.__setFault=(fault)=>{const c=window.__audioContexts.at(-1);c.fault=fault;c.dispatchEvent(new Event('statechange'))};
 window.__visibility=(hidden)=>{window.__hidden=hidden;document.dispatchEvent(new Event('visibilitychange'))};
})();'''
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4192'},stdout=subprocess.DEVNULL)
try:
 time.sleep(1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  context.add_init_script(FAULTS);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.goto('http://127.0.0.1:4192');page.locator('#choose-bjj').click();page.locator('#protocol-select').select_option('drills-sequence')
  page.locator('#primary').click();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO')
  def advance(ms):page.evaluate('(ms)=>window.__time+=ms',ms);page.wait_for_timeout(180)
  def snapshot():return page.evaluate('()=>({clock:document.querySelector("#clock").textContent,round:document.querySelector("#round-number").textContent,protocol:document.querySelector("#protocol-select").value,mode:document.querySelector("#change-mode").textContent,phase:document.querySelector("#phase-label").textContent})')
  def count():return page.evaluate('window.__audioTones.length')
  def visible_recovery():expect(page.locator('#audio-status')).to_have_text('Áudio habilitado',timeout=7000)
  advance(3000);visible_recovery();expect(page.locator('#phase-label')).to_have_text('LUTA')
  for i,fault in enumerate(['suspended','interrupted','frozen','healthy','interrupted','suspended']):
   old=count();identity=page.evaluate('window.__audioContexts.length')
   page.evaluate('window.__visibility(true)');page.evaluate('(fault)=>window.__setFault(fault)',fault);advance(1100)
   page.evaluate('window.__visibility(false)');visible_recovery()
   expect(page.locator('#audio-recovery-action')).to_be_visible()
   assert page.locator('#primary').evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===el}')
   state=snapshot();assert state['round'].strip()=='01 / 08' and state['protocol']=='drills-sequence' and state['mode']=='MODO BJJ' and state['phase']=='LUTA',state
   assert state['clock']==f'00:{60-((i+1)*1100)//1000:02d}',state
   assert count()==old,'Recovery generated or replayed a tone'
   if fault=='frozen':assert page.evaluate('window.__audioContexts.length')==identity+1
  ok('6 ciclos hidden/visible: suspended, interrupted e running congelado recuperam sem bipes extras e descontam tempo')
  page.locator('#primary').click();paused=snapshot()
  for i in range(3):
   page.evaluate('window.__visibility(true)');page.evaluate('window.__setFault("interrupted")');advance(20000);page.evaluate('window.__visibility(false)');visible_recovery();assert snapshot()==paused
  ok('3 ciclos pausados preservam integralmente fase, tempo, round, protocolo e modo')
  # Explicit refusal models iOS requiring a fresh interaction.
  page.evaluate('window.__visibility(true);window.__blockAudio=true');advance(3000);old=count();page.evaluate('window.__visibility(false)')
  expect(page.locator('#audio-recovery-action')).to_be_visible(timeout=7000);assert snapshot()==paused
  page.evaluate('window.__blockAudio=false');page.locator('#audio-recovery-action').tap();visible_recovery()
  expect(page.locator('#audio-recovery-action')).not_to_be_visible();assert snapshot()==paused and count()==old
  ok('Bloqueio automático oferece botão direto; um único toque recupera sem reiniciar ou testar sirene')
  # Foreground statechange and apparently-running route repair.
  old=count();page.evaluate('window.__setFault("interrupted")');visible_recovery();assert snapshot()==paused and count()==old
  cycles=page.evaluate('window.__audioContexts.at(-1).cycles');page.evaluate('window.dispatchEvent(new Event("blur"))');advance(2000);page.evaluate('window.dispatchEvent(new Event("focus"))');visible_recovery()
  assert page.evaluate('window.__audioContexts.at(-1).cycles')>cycles and snapshot()==paused
  ok('Interrupção em primeiro plano e retorno por focus também recuperam saída sem afetar pausa')
  # bfcache fencing and WebLock recovery are still used.
  old=count();page.evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');visible_recovery();assert snapshot()==paused and count()==old
  ok('BFcache simulado recupera posse e áudio sem duplicar sinais ou perder treino')
  # Resume near the mandatory countdown, then recover on an already-consumed second.
  page.locator('#primary').click();advance(50400);expect(page.locator('#clock')).to_have_text('00:03');before=count()
  page.locator('#primary').click();page.evaluate('window.__visibility(true);window.__setFault("interrupted");window.__visibility(false)');visible_recovery();assert count()==before
  page.locator('#primary').click();advance(1000);assert count()==before+1
  advance(1000);assert count()==before+2
  advance(1000);assert count()==before+3;expect(page.locator('#phase-label')).to_have_text('DESCANSO')
  ok('Reativação no segundo 3 não repete bip; segundos 2/1/zero seguem com exatamente três sinais')
  page.locator('#primary').click();before=snapshot();page.locator('#open-settings').click();page.locator('[name=audioPreset]').select_option('silent');page.locator('#settings-form button[type=submit]').click()
  resumes=page.evaluate('window.__audioContexts.reduce((n,c)=>n+c.resumes,0)');old=count()
  page.evaluate('window.__visibility(true);window.__setFault("interrupted");window.__visibility(false)');page.wait_for_timeout(350)
  assert snapshot()==before and count()==old
  assert page.evaluate('window.__audioContexts.reduce((n,c)=>n+c.resumes,0)')==resumes
  expect(page.locator('#audio-recovery-action')).not_to_be_visible()
  ok('Silencioso impede retomada de áudio e avisos de recuperação desnecessários')
  assert not errors,errors;assert page.locator('audio,video').count()==0
  ok('Sem exceções JavaScript, elementos de mídia ou som de diagnóstico durante recuperação')
  browser.close()
 (OUT/'audio-recovery-results.json').write_text(json.dumps({'passed':len(results),'scenarios':results,'physical_iphone':False,'physical_roku':False,'music_concurrent':False},ensure_ascii=False,indent=2))
finally:server.terminate();server.wait(timeout=5)
