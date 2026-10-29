"""Focused duration editor regression with real touch emulation; no physical Android claim."""
from pathlib import Path
import json,subprocess,os,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
KEY='moreira-bjj:settings:v1';results=[]
def ok(name):
 results.append(name);print('PASS:',name,flush=True)
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4189'},stdout=subprocess.DEVNULL)
try:
 time.sleep(1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4189');cpu_rate=float(os.environ.get('WHEEL_CPU_RATE','1'))
  cdp=ctx.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu_rate});page.locator('#choose-moreira').click()
  def open_panel():
   page.locator('#open-settings').click();expect(page.locator('#settings-form')).to_be_visible()
  def wheel(name):return page.locator(f'[data-wheel="{name}"]')
  def position(name,value,offset=0):wheel(name).evaluate('(el,args)=>el.scrollTop=(args[0]-Number(el.dataset.min))*40+args[1]',[value,offset])
  def stored():return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
  def edit(kind):
   page.locator(f'#edit-{kind}').tap();expect(page.locator('#time-editor-title')).to_have_text('LUTA' if kind=='fight' else 'DESCANSO')
   assert page.locator('#settings-form').count()==0
   expect(page.locator('.wheel-picker')).to_have_count(2)
  def done():
   page.locator('#time-done').tap();expect(page.locator('#settings-form')).to_be_visible()
  def set_duration(kind,minutes,seconds):
   edit(kind);position(kind+'Minutes',minutes,6);position(kind+'Seconds',seconds,4);done()
  def save():
   page.locator('#settings-form button[type="submit"]').tap();expect(page.locator('#settings-dialog')).not_to_be_visible()
  def no_keyboard():
   assert page.locator('#settings-dialog input:not([type="hidden"])').count()==0
   assert page.evaluate('!document.activeElement?.matches("input,textarea")')
  open_panel();edit('fight');no_keyboard()
  assert page.locator('.wheel-row').count()<=22
  above=wheel('fightMinutes').locator('[data-value="4"]').bounding_box()
  center=wheel('fightMinutes').locator('[data-value="5"]').bounding_box()
  below=wheel('fightMinutes').locator('[data-value="6"]').bounding_box()
  assert above['y']<center['y']<below['y']
  page.screenshot(path=str(OUT/'editor-luta-mobile.png'))
  page.locator('#time-back').tap()
  ok('LUTA abre tela exclusiva com dois seletores, vizinhos acima/abaixo, sem teclado e no máximo 22 linhas')
  for i in range(12):
   old=stored()
   set_duration('fight',i+1,(i*7)%60);set_duration('rest',i%4,(i*3)%60)
   position('rounds',i+1)
   assert stored()==old,'Concluído must not write permanent settings'
   expected={'fight':(i+1)*60+(i*7)%60,'rest':(i%4)*60+(i*3)%60,'rounds':i+1,'preparation':3}
   save();assert stored()['training']==expected
   expect(page.locator('#clock')).to_have_text(f'{expected["fight"]//60:02d}:{expected["fight"]%60:02d}')
   open_panel();expect(page.locator('#edit-fight strong')).to_have_text(f'{i+1:02d}:{(i*7)%60:02d}')
   page.locator('#library-data > summary').click();page.locator('#open-data').click();page.locator('#settings-back').click()
  ok('12 ciclos completos: LUTA/DESCANSO → CONCLUÍDO → SALVAR fecha sem X; persistência e relógio imediato')
  old=stored();set_duration('fight',2,17)
  page.locator('#library-data > summary').click();page.locator('#open-data').click();page.locator('#settings-back').click()
  expect(page.locator('#edit-fight strong')).to_have_text('02:17')
  edit('fight');position('fightSeconds',42);page.locator('#time-back').tap()
  expect(page.locator('#edit-fight strong')).to_have_text('02:17')
  edit('rest');page.keyboard.press('Escape');expect(page.locator('#settings-form')).to_be_visible()
  page.locator('#close-settings').tap();open_panel();assert stored()==old
  expect(page.locator('#edit-fight strong')).to_have_text('12:17')
  ok('Rascunho sobrevive à navegação; Voltar/Escape cancelam só o editor; fechar sem salvar descarta mudanças')
  edit('fight');position('fightSeconds',20);page.wait_for_timeout(200)
  box=wheel('fightSeconds').bounding_box();x=box['x']+box['width']/2;y=box['y']+150
  wheel('fightSeconds').evaluate('(el)=>{window.__lastScroll=performance.now();el.addEventListener("scroll",()=>window.__lastScroll=performance.now(),{passive:true})}')
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
  for dy in range(10,101,10):
   cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-dy}]});page.wait_for_timeout(30)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  page.wait_for_function('() => performance.now()-window.__lastScroll>200 && Math.abs(document.querySelector("[data-wheel=fightSeconds]").scrollTop%40)<1',timeout=5000)
  actual=int(wheel('fightSeconds').get_attribute('aria-valuenow'));assert actual>20,actual
  assert abs(wheel('fightSeconds').evaluate('(el)=>el.scrollTop%40'))<1
  no_keyboard();done();expect(page.locator('#edit-fight strong')).to_have_text(f'12:{actual:02d}')
  ok('Toque emulado: rolagem nativa com inércia, encaixe automático e CONCLUÍDO captura seleção')
  edit('fight');position('fightSeconds',20);page.wait_for_timeout(200)
  wheel('fightSeconds').tap(position={'x':30,'y':140})
  expect(wheel('fightSeconds')).to_have_attribute('aria-valuenow','21')
  page.wait_for_timeout(350)
  # Holding a touch must not trigger the fallback snap in the middle of the gesture.
  wheel('fightSeconds').dispatch_event('touchstart')
  position('fightSeconds',20,13);page.wait_for_timeout(250)
  assert abs(wheel('fightSeconds').evaluate('(el)=>el.scrollTop')-813)<1
  wheel('fightSeconds').dispatch_event('touchend');page.wait_for_timeout(350)
  assert abs(wheel('fightSeconds').evaluate('(el)=>el.scrollTop%40'))<1
  done();ok('Toque no vizinho seleciona valor; dedo apoiado não é interrompido pelo encaixe')
  # Confirm while pending scroll handlers/debounce have not run.
  edit('fight');position('fightMinutes',0);position('fightSeconds',9,12)
  page.locator('#time-done').evaluate('(button)=>button.click()')
  expect(page.locator('#edit-fight strong')).to_have_text('00:09')
  edit('rest');position('restMinutes',0);position('restSeconds',0);done();position('rounds',2);save()
  ok('CONCLUÍDO lê a posição atual antes de scrollend, sem atraso ou dependência do debounce')
  page.reload();page.locator('#choose-moreira').tap();open_panel();expect(page.locator('#edit-fight strong')).to_have_text('00:09')
  edit('fight');wheel('fightMinutes').focus();page.keyboard.press('End');page.wait_for_timeout(200)
  assert wheel('fightMinutes').get_attribute('aria-valuenow')=='1440'
  position('fightSeconds',1);page.locator('#time-done').tap();expect(page.locator('#time-error')).to_contain_text('24 horas')
  position('fightMinutes',0);position('fightSeconds',0);page.locator('#time-done').tap();expect(page.locator('#time-error')).to_contain_text('1 segundo')
  page.locator('#time-back').tap();expect(page.locator('#edit-fight strong')).to_have_text('00:09')
  ok('Persistência após reload, limites de 24h e luta zero inválida mantêm editor aberto sem perder rascunho')
  set_duration('fight',0,10)
  page.evaluate('() => {window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")}}')
  page.locator('#settings-form button[type="submit"]').tap();expect(page.locator('#settings-feedback')).to_contain_text('Não foi possível salvar')
  expect(page.locator('#settings-dialog')).to_be_visible()
  page.evaluate('() => {Storage.prototype.setItem=window.originalSet}')
  assert stored()['training']['fight']==9
  save();assert stored()['training']['fight']==10
  ok('Falha de armazenamento mantém formulário/rascunho; nova tentativa salva e fecha automaticamente')
  open_panel();set_duration('fight',0,8);page.locator('[name="audioPreset"]').select_option('silent');page.locator('#test-audio').tap()
  assert stored()['training']['fight']==10
  expect(page.locator('#edit-fight strong')).to_have_text('00:08');save()
  ok('Testar som não grava tempos ainda em rascunho nem perde a edição')
  open_panel();edit('rest');page.wait_for_timeout(300)
  page.evaluate('window.n=0;window.obs=new MutationObserver(x=>window.n+=x.length);obs.observe(document.querySelector(".app-shell"),{childList:true,attributes:true,subtree:true,characterData:true})')
  page.wait_for_timeout(1000);mutations=page.evaluate('window.n');assert mutations==0,mutations
  page.evaluate('obs.disconnect()')
  page.set_viewport_size({'width':844,'height':390});expect(page.locator('#time-done')).to_be_visible()
  assert page.locator('.time-editor').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1')
  page.screenshot(path=str(OUT/'editor-descanso-landscape.png'));done();save()
  ok('Editor parado sem mutações no timer; orientação horizontal preserva seleção e CONCLUÍDO visível')
  page.set_viewport_size({'width':390,'height':844});page.locator('#primary').tap();expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
  page.wait_for_timeout(3200);expect(page.locator('#phase-label')).to_contain_text('LUTA')
  for _ in range(3):
   page.locator('#primary').tap();expect(page.locator('#phase-label')).to_contain_text('PAUSADO')
   clock=page.locator('#clock').inner_text();open_panel();expect(page.locator('#edit-fight')).to_be_disabled();expect(page.locator('#edit-rest')).to_be_disabled()
   page.locator('[name="audioPreset"]').select_option('silent');save();assert page.locator('#clock').inner_text()==clock
   page.locator('#primary').tap();expect(page.locator('#phase-label')).to_contain_text('LUTA')
  ok('3 ciclos de pausa/salvar som/retomada não reiniciam treino; edição de tempos bloqueada durante sessão')
  assert errors==[],errors;ok('Nenhuma exceção JavaScript durante o fluxo completo')
  browser.close()
 (OUT/'wheel-results.json').write_text(json.dumps({'passed':len(results),'scenarios':results,'idle_mutations_per_second':mutations,'physical_android':False,'cpu_throttle':cpu_rate},ensure_ascii=False,indent=2))
finally:server.terminate();server.wait(timeout=5)
