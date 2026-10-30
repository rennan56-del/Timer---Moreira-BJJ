"""Home navigation and independent-device profiles on the same origin.
Browser contexts simulate devices; no claim of physical phone testing.
"""
from pathlib import Path
import json,os,subprocess,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
KEY='moreira-bjj:settings:v1';SESSION='moreira-bjj:workout:v1';results=[];requests=[]
def ok(text):results.append(text);print('PASS:',text,flush=True)
CLOCK='''(()=>{const base=Date.now();window.__time=Number(localStorage.getItem('__isolationClock'))||0;performance.now=()=>window.__time;Date.now=()=>base+window.__time;window.__tones=0;const C=window.AudioContext;const osc=C.prototype.createOscillator;C.prototype.createOscillator=function(){const o=osc.call(this),start=o.start.bind(o);o.start=(...args)=>{window.__tones++;return start(...args)};return o}})();'''
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4194'},stdout=subprocess.DEVNULL)
try:
 time.sleep(.7)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);errors=[]
  def device(mode,fallback=False):
   ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block');ctx.add_init_script(CLOCK)
   if fallback:ctx.add_init_script('Object.defineProperty(navigator,"locks",{value:undefined})')
   page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda req:requests.append((req.method,req.url)));page.on('dialog',lambda d:d.accept());page.goto('http://127.0.0.1:4194');page.locator('#choose-'+mode).tap();return ctx,page
  def advance(page,ms):page.evaluate('(ms)=>{window.__time+=ms;localStorage.setItem("__isolationClock",String(window.__time))}',ms);page.wait_for_timeout(160)
  def config(page,fight,rest,rounds):
   page.locator('#open-settings').tap()
   for kind,duration in [('fight',fight),('rest',rest)]:
    page.locator('#edit-'+kind).tap()
    for unit,v in [('Minutes',duration//60),('Seconds',duration%60)]:page.locator(f'[data-wheel="{kind}{unit}"]').evaluate('(el,v)=>el.scrollTop=v*40',v)
    page.locator('#time-done').tap()
   page.locator('[data-wheel=rounds]').evaluate('(el,v)=>el.scrollTop=(v-1)*40',rounds);page.locator('#settings-form button[type=submit]').tap()
  def state(page):return page.evaluate('()=>({clock:document.querySelector("#clock").textContent,round:document.querySelector("#round-number").textContent,phase:document.querySelector("#phase-label").textContent,protocol:document.querySelector("#protocol-select").value,settings:localStorage.getItem("moreira-bjj:settings:v1"),session:localStorage.getItem("moreira-bjj:workout:v1")})')
  def start(page):page.locator('#primary').tap();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO')
  def home(page,target):
   page.locator(target).tap();expect(page.locator('#mode-screen')).to_be_visible();expect(page.locator('.app-shell')).to_be_hidden()
   assert page.evaluate('(key)=>localStorage.getItem(key)',SESSION) is None
   tones=page.evaluate('window.__tones');advance(page,20000);assert page.evaluate('window.__tones')==tones
  for mode in ['moreira','bjj']:
   ctx,page=device(mode);config(page,4,3,2);saved=state(page)['settings']
   home(page,'#home-brand .brand-name');page.locator('#choose-'+mode).tap();expect(page.locator('#phase-label')).to_have_text('PRONTO')
   start(page);home(page,'#home-brand img');page.locator('#choose-'+mode).tap()
   start(page);advance(page,3000);expect(page.locator('#phase-label')).to_have_text('LUTA');page.locator('#tv-toggle').tap();page.locator('#home-brand').focus();page.keyboard.press('Space')
   expect(page.locator('#mode-screen')).to_be_visible();assert 'tv-mode' not in page.locator('body').get_attribute('class');assert page.evaluate('(key)=>localStorage.getItem(key)',SESSION) is None
   page.locator('#choose-'+mode).tap();start(page);advance(page,3000);page.locator('#primary').tap();expect(page.locator('#phase-label')).to_contain_text('PAUSADO');home(page,'#home-brand')
   page.locator('#choose-'+mode).tap();start(page);advance(page,7000);expect(page.locator('#phase-label')).to_have_text('DESCANSO');home(page,'#home-brand')
   page.locator('#choose-'+mode).tap();start(page);advance(page,14000);expect(page.locator('#phase-label')).to_have_text('TREINO FINALIZADO');home(page,'#home-brand')
   page.locator('#choose-'+mode).tap();expect(page.locator('#restore-banner')).to_be_hidden();assert state(page)['settings']==saved
   assert page.locator('#home-brand').evaluate('(el)=>el.tagName')=='BUTTON'
   page.set_viewport_size({'width':320,'height':740});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/f'home-brand-{mode}-320.png'));ctx.close()
   ok(f'{mode}: logo/nome/teclado voltam ao início em pronto, preparação, luta, pausa, descanso e final; sons e retomada encerrados')
  # Deferred WebLock callback: home must invalidate pending start and late callbacks.
  ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block');ctx.add_init_script(CLOCK);ctx.add_init_script('''(()=>{const locks=navigator.locks;window.__delayLock=true;Object.defineProperty(navigator,'locks',{value:{request(name,options,callback){return locks.request(name,options,async lock=>{if(window.__delayLock)await new Promise(r=>window.__releaseLock=r);return callback(lock)})}}})})();''')
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:4194');page.locator('#choose-moreira').tap();page.locator('#primary').tap();page.wait_for_function('()=>typeof window.__releaseLock==="function"');page.locator('#home-brand').tap();page.evaluate('window.__delayLock=false;window.__releaseLock()');page.wait_for_timeout(200)
  expect(page.locator('#mode-screen')).to_be_visible();assert page.evaluate('(key)=>localStorage.getItem(key)',SESSION) is None
  page.locator('#choose-bjj').tap();start(page);ctx.close();ok('Início pendente cancelado pela marca não começa depois; novo treino pode iniciar normalmente')
  # Three simultaneously running device profiles. Third covers the storage fallback.
  devices=[device('moreira'),device('bjj'),device('moreira',True)];a,b,c=[d[1] for d in devices]
  config(a,20,5,2);config(b,40,8,3);c.locator('#protocol-select').select_option('descending')
  for page in [a,b,c]:start(page);advance(page,3000)
  expect(a.locator('#clock')).to_have_text('00:20');expect(b.locator('#clock')).to_have_text('00:40');expect(c.locator('#clock')).to_have_text('10:00');a0,b0,c0=state(a),state(b),state(c)
  advance(a,20000);expect(a.locator('#phase-label')).to_have_text('DESCANSO');assert state(b)==b0 and state(c)==c0
  b.locator('#primary').tap();paused=state(b);home(a,'#home-brand');assert state(b)==paused and state(c)==c0
  # A second tab on B must stay blocked, and going home there must not clear B's session.
  tab=devices[1][0].new_page();tab.on('dialog',lambda d:d.accept());tab.goto('http://127.0.0.1:4194');tab.locator('#choose-bjj').tap();tab.locator('#restore-session').tap();page.wait_for_timeout(160);tab.locator('#home-brand').tap();assert state(b)==paused;tab.close()
  a.locator('#choose-moreira').tap();config(a,25,6,4);assert state(b)==paused and state(c)==c0
  b.reload();b.locator('#choose-bjj').tap();b.locator('#restore-session').tap();expect(b.locator('#phase-label')).to_contain_text('PAUSADO');expect(b.locator('#clock')).to_have_text('00:40');assert json.loads(state(b)['settings'])['training']=={'fight':40,'rest':8,'rounds':3,'preparation':3}
  assert state(c)==c0
  b.locator('#primary').tap();advance(b,48000);expect(b.locator('#phase-label')).to_have_text('LUTA');expect(b.locator('#round-number')).to_have_text(__import__('re').compile(r'^02\s*/\s*03$'))
  assert state(c)==c0 and json.loads(state(a)['settings'])['training']['fight']==25
  advance(c,720000);expect(c.locator('#clock')).to_have_text('08:00');assert state(b)['round'].strip()=='02 / 03'
  ok('3 dispositivos simulados simultâneos: durações, rounds, pausa, saída, configurações, recuperação e protocolo independentes')
  ok('Bloqueio de outra aba permanece local ao perfil, inclusive no fallback, sem afetar os outros dispositivos')
  assert all(method=='GET' and (url.startswith('http://127.0.0.1:4194/') or url.startswith('blob:http://127.0.0.1:4194/')) for method,url in requests),(requests[-5:])
  ok('Nenhuma requisição de estado compartilhado/servidor; armazenamento e operações locais ao dispositivo')
  assert not errors,errors
  for ctx,page in devices:ctx.close()
  browser.close()
 (OUT/'home-isolation-results.json').write_text(json.dumps({'passed':len(results),'scenarios':results,'simultaneous_device_profiles':3,'physical_devices':False},ensure_ascii=False,indent=2))
finally:server.terminate();server.wait(timeout=5)
