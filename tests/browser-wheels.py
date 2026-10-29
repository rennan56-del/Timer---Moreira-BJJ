"""Touch emulation, scrolling and saving regression; not physical Android validation."""
from pathlib import Path
import json,subprocess,os,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
KEY='moreira-bjj:settings:v1'
results=[]
def ok(name):
 results.append(name);print('PASS:',name,flush=True)
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4189'},stdout=subprocess.DEVNULL)
try:
 time.sleep(1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4189');cpu_rate=float(os.environ.get('WHEEL_CPU_RATE','1'));ctx.new_cdp_session(page).send('Emulation.setCPUThrottlingRate',{'rate':cpu_rate});page.locator('#choose-moreira').click()
  def open_panel():
   page.locator('#open-settings').click();expect(page.locator('#settings-form')).to_be_visible()
  def wheel(name):return page.locator(f'[data-wheel="{name}"]')
  def position(name,value,offset=0):wheel(name).evaluate('(el,args)=>el.scrollTop=(args[0]-Number(el.dataset.min))*40+args[1]',[value,offset])
  def save():page.locator('#settings-form').evaluate('(form)=>form.requestSubmit()')
  def stored():return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
  open_panel()
  assert page.locator('#settings-form input:not([type="hidden"])').count()==0
  assert page.locator('.wheel-row').count()<=55
  ok('Sem digitação/teclado e no máximo 55 linhas montadas nos cinco seletores')
  for i in range(12):
   f=i+1;r=(i*7)%60
   position('fightMinutes',f,7);position('fightSeconds',r,3)
   position('restMinutes',i%4);position('restSeconds',(i*3)%60)
   position('rounds',i+1)
   # Submit in the same task, before pending scrollend/debounce callbacks.
   save();expected={'fight':f*60+r,'rest':(i%4)*60+(i*3)%60,'rounds':i+1,'preparation':3}
   assert stored()['training']==expected,(stored()['training'],expected)
   expect(page.locator('#clock')).to_have_text(f'{expected["fight"]//60:02d}:{expected["fight"]%60:02d}')
   expect(page.locator('#settings-feedback')).to_have_text('Configurações salvas.')
   page.locator('#close-settings').click();open_panel()
   assert wheel('fightMinutes').get_attribute('aria-valuenow')==str(f)
   # Secondary navigation and return must recreate the wheels at the saved position.
   page.locator('#library-data > summary').click();page.locator('#open-data').click();page.locator('#settings-back').click()
   assert wheel('fightSeconds').get_attribute('aria-valuenow')==str(r)
  ok('12 ciclos de edição/salvamento imediato/fechar/reabrir/navegação preservam todos os valores')
  # Real browser touch events: swipe without preventing native scrolling.
  position('fightSeconds',20);page.wait_for_timeout(200)
  wheel('fightSeconds').scroll_into_view_if_needed();box=wheel('fightSeconds').bounding_box()
  cdp=ctx.new_cdp_session(page);x=box['x']+box['width']/2;y=box['y']+90
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
  for dy in range(10,71,10):
   cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-dy}]});page.wait_for_timeout(30)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(650)
  actual=int(wheel('fightSeconds').get_attribute('aria-valuenow'));assert actual>20,actual
  save();assert stored()['training']['fight']%60==actual
  assert abs(wheel('fightSeconds').evaluate('(el)=>el.scrollTop%40'))<1
  ok('Gesto touch emulado rola com inércia, alinha uma linha e salva a seleção')
  wheel('fightMinutes').focus();page.keyboard.press('End');page.wait_for_timeout(650)
  assert wheel('fightMinutes').get_attribute('aria-valuenow')=='1440'
  page.keyboard.press('Home');page.wait_for_timeout(650)
  assert wheel('fightMinutes').get_attribute('aria-valuenow')=='0'
  position('fightMinutes',0);position('fightSeconds',0);save()
  expect(page.locator('#settings-feedback')).not_to_have_text('Configurações salvas.')
  position('fightSeconds',8);position('restMinutes',0);position('restSeconds',0);position('rounds',2);save()
  assert stored()['training']=={'fight':8,'rest':0,'rounds':2,'preparation':3}
  ok('Limites de 0–1440 minutos, teclado acessível, luta zero rejeitada e descanso zero aceito')
  page.locator('#close-settings').click();page.reload();page.locator('#choose-moreira').click();open_panel()
  assert wheel('fightSeconds').get_attribute('aria-valuenow')=='8'
  ok('Configurações persistem após recarregar e escolher modo novamente')
  # Storage errors must be explicit and cannot change the in-memory engine.
  position('fightSeconds',10)
  page.evaluate('() => {window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError")}}')
  save();expect(page.locator('#settings-feedback')).to_contain_text('Não foi possível salvar')
  page.evaluate('() => {Storage.prototype.setItem=window.originalSet}');page.locator('#close-settings').click();open_panel()
  assert wheel('fightSeconds').get_attribute('aria-valuenow')=='8'
  ok('Falha de armazenamento informa erro e mantém configuração anterior; nova tentativa é possível')
  position('fightSeconds',9);save();assert stored()['training']['fight']==9
  page.locator('#close-settings').click();open_panel();page.wait_for_timeout(300)
  page.evaluate('window.n=0;window.obs=new MutationObserver(x=>window.n+=x.length);obs.observe(document.querySelector(".app-shell"),{childList:true,attributes:true,subtree:true,characterData:true})')
  page.wait_for_timeout(1000);mutations=page.evaluate('window.n');assert mutations==0,mutations
  page.evaluate('obs.disconnect()');ok('Zero mutações na tela parada durante 1 segundo com configurações abertas')
  page.screenshot(path=str(OUT/'wheel-settings-mobile.png'))
  page.locator('#close-settings').click();page.locator('#primary').click();expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
  page.wait_for_timeout(3200);expect(page.locator('#phase-label')).to_contain_text('LUTA')
  for _ in range(3):
   page.locator('#primary').click();expect(page.locator('#phase-label')).to_contain_text('PAUSADO')
   clock=page.locator('#clock').inner_text();open_panel()
   expect(wheel('fightMinutes')).to_have_attribute('aria-disabled','true')
   page.locator('[name="audioPreset"]').select_option('silent');save();page.wait_for_timeout(250)
   assert page.locator('#clock').inner_text()==clock
   assert stored()['training']['fight']==9
   page.locator('#close-settings').click();page.locator('#primary').click();expect(page.locator('#phase-label')).to_contain_text('LUTA')
  ok('3 ciclos de pausa/configurações/salvar som/retomada preservam treino e bloqueiam edição dos tempos')
  assert errors==[],errors
  ok('Nenhuma exceção JavaScript durante todos os ciclos')
  browser.close()
 (OUT/'wheel-results.json').write_text(json.dumps({'passed':len(results),'scenarios':results,'idle_mutations_per_second':mutations,'physical_android':False,'cpu_throttle':cpu_rate},ensure_ascii=False,indent=2))
finally:server.terminate();server.wait(timeout=5)
