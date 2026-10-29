"""Full protocol/UI integration on controlled clocks, not physical Android/Roku."""
from pathlib import Path
import os,json,subprocess,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
KEY='moreira-bjj:settings:v1';results=[]
def ok(name):results.append(name);print('PASS:',name,flush=True)
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4191'},stdout=subprocess.DEVNULL)
try:
 time.sleep(1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for mode in ['moreira','bjj']:
   ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   ctx.add_init_script('''(()=>{const base=Date.now();window.__time=Number(localStorage.getItem('__protocolClock'))||0;performance.now=()=>window.__time;Date.now=()=>base+window.__time;})();''')
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto('http://127.0.0.1:4191');page.locator('#choose-'+mode).click()
   def advance(ms):
    page.evaluate('(ms)=>{window.__time+=ms;localStorage.setItem("__protocolClock",String(window.__time))}',ms);page.wait_for_timeout(140)
   def choice(id):page.locator('#protocol-select').select_option(id);page.wait_for_timeout(80)
   def current():return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
   # Save nondefault manual values via the actual focused editor.
   page.locator('#open-settings').click()
   for kind,seconds in [('fight',317),('rest',43)]:
    page.locator('#edit-'+kind).click()
    for unit,n in [('Minutes',seconds//60),('Seconds',seconds%60)]:page.locator(f'[data-wheel="{kind}{unit}"]').evaluate('(el,n)=>el.scrollTop=n*40',n)
    page.locator('#time-done').click()
   page.locator('[data-wheel="rounds"]').evaluate('(el)=>el.scrollTop=5*40')
   page.locator('#settings-form button[type=submit]').click();manual=current()['training'];assert manual=={'fight':317,'rest':43,'rounds':6,'preparation':3}
   assert page.locator('#protocol-select').input_value()==''
   expect(page.locator('#protocol-select option:checked')).to_have_text('Treino personalizado')
   for id,name,fights,rest in [('descending','Rolas Decrescentes',[600,480,360],120),('drills-1-1','Drills Padrões 1/1',[60]*8,10),('drills-sequence','Drills em Sequência 4/0:30',[60]*8,30)]:
    choice(id);expect(page.locator('#protocol-select option:checked')).to_have_text(name)
    expect(page.locator('#phase-label')).to_have_text('PRONTO');expect(page.locator('#clock')).to_have_text(f'{fights[0]//60:02d}:00')
    advance(5000);expect(page.locator('#phase-label')).to_have_text('PRONTO')
    assert current()['training']==manual
    page.locator('#primary').click();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO');expect(page.locator('#clock')).to_have_text('00:03');advance(3000)
    for r,duration in enumerate(fights,1):
     expect(page.locator('#phase-label')).to_have_text('LUTA');expect(page.locator('#round-number')).to_have_text(__import__('re').compile(rf'^{r:02d}\s*/\s*{len(fights):02d}$'))
     expect(page.locator('#clock')).to_have_text(f'{duration//60:02d}:{duration%60:02d}')
     if id=='drills-sequence':expect(page.locator('#protocol-stage')).to_have_text(f'Aluno {1 if r<=4 else 2} · rodada {(r-1)%4+1}/4')
     if r==1:
      advance(1234);page.locator('#primary').click();before=page.locator('#clock').inner_text();advance(10000);assert page.locator('#clock').inner_text()==before
      page.locator('#primary').click();advance(duration*1000-1234)
     else:advance(duration*1000)
     if r<len(fights):
      expect(page.locator('#phase-label')).to_have_text('DESCANSO');expect(page.locator('#clock')).to_have_text(f'00:{rest:02d}' if rest<60 else f'{rest//60:02d}:00')
      if id=='drills-sequence' and r==4:expect(page.locator('#protocol-stage')).to_have_text('Troca de aluno')
      advance(rest*1000)
    expect(page.locator('#phase-label')).to_have_text('TREINO FINALIZADO');expect(page.locator('#clock')).to_have_text('00:00');advance(60000)
    expect(page.locator('#phase-label')).to_have_text('TREINO FINALIZADO');assert current()['training']==manual
    assert page.locator('#change-mode').inner_text()==('MODO MOREIRA' if mode=='moreira' else 'MODO BJJ')
    choice('manual');expect(page.locator('#clock')).to_have_text('05:17');expect(page.locator('#round-number')).to_have_text(__import__('re').compile(r'^01\s*/\s*06$'));assert current()['training']==manual
    ok(f'{mode}: {name} completo, pausa, preparação, duração real, sem descanso final e retorno manual')
   choice('descending');page.locator('#primary').click();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO');advance(3000)
   choice('drills-1-1');expect(page.locator('#confirm-dialog')).to_be_visible();expect(page.locator('#protocol-select')).to_have_value('descending');page.locator('#confirm-no').click()
   expect(page.locator('#protocol-select')).to_have_value('descending');expect(page.locator('#phase-label')).to_have_text('LUTA')
   choice('drills-1-1');page.locator('#confirm-yes').click();expect(page.locator('#phase-label')).to_have_text('PRONTO');expect(page.locator('#protocol-select')).to_have_value('drills-1-1')
   page.locator('#primary').click();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO');advance(3000);page.locator('#primary').click()
   choice('manual');expect(page.locator('#confirm-dialog')).to_be_visible();page.locator('#confirm-no').click();expect(page.locator('#phase-label')).to_contain_text('PAUSADO')
   choice('manual');page.locator('#confirm-yes').click();expect(page.locator('#clock')).to_have_text('05:17');expect(page.locator('#phase-label')).to_have_text('PRONTO');assert current()['training']==manual
   ok(f'{mode}: confirmação/cancelamento antes de trocar ou sair preserva sessão e modo')
   choice('descending');page.locator('#primary').click();expect(page.locator('#phase-label')).to_have_text('PREPARAÇÃO');advance(3000+600000+120000+1234);page.locator('#primary').click()
   before=page.locator('#clock').inner_text();page.reload();page.locator('#choose-'+mode).click();page.locator('#restore-session').click();expect(page.locator('#phase-label')).to_contain_text('PAUSADO');expect(page.locator('#clock')).to_have_text(before)
   expect(page.locator('#protocol-select')).to_have_value('descending');assert current()['training']==manual
   choice('manual');page.locator('#confirm-yes').click();expect(page.locator('#clock')).to_have_text('05:17')
   ok(f'{mode}: recuperação de protocolo pausado mantém round/tempo e não sobrescreve configurações manuais')
   # Manual edits made while a preset is selected remain available on leaving it.
   choice('descending');page.locator('#open-settings').click();page.locator('#edit-fight').click();page.locator('[data-wheel=fightSeconds]').evaluate('(el)=>el.scrollTop=23*40');page.locator('#time-done').click();page.locator('#settings-form button[type=submit]').click()
   expect(page.locator('#clock')).to_have_text('10:00');choice('manual');expect(page.locator('#clock')).to_have_text('05:23')
   ok(f'{mode}: últimas alterações manuais ficam separadas do protocolo')
   choice('drills-sequence')
   page.screenshot(path=str(OUT/f'protocol-{mode}-mobile.png'))
   page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.set_viewport_size({'width':1920,'height':1080});page.screenshot(path=str(OUT/f'protocol-{mode}-tv.png'))
   assert not errors,errors;ctx.close()
  browser.close()
 (OUT/'protocol-results.json').write_text(json.dumps({'passed':len(results),'scenarios':results,'physical_android':False},ensure_ascii=False,indent=2))
finally:server.terminate();server.wait(timeout=5)
