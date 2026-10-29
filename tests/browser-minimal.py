"""Browser QA for the full-screen minimalist revision.
Uses preinstalled Playwright/Chromium and a temporary loopback server only.
Run after building: python3 tests/browser-minimal.py
This does not certify Android/Roku hardware, casting, or physical music mixing.
"""
from pathlib import Path
from http.client import HTTPConnection
import subprocess, os, time, json, re
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
PORT = 4186
URL = f'http://127.0.0.1:{PORT}/'
SETTINGS_KEY = 'moreira-bjj:settings:v1'
results = []
server = None
AUDIO_TRACE = '''(() => {
  window.__audioEvents=[];
  const C=window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  const original=C.prototype.createOscillator;
  C.prototype.createOscillator=function() {
    const node=original.call(this), context=this;
    const begin=node.start.bind(node), end=node.stop.bind(node);
    let trace;
    node.start=(when=0)=>{trace={start:when || context.currentTime,frequency:node.frequency.value};window.__audioEvents.push(trace);return begin(when);};
    node.stop=(when=0)=>{if(trace)trace.end=when || context.currentTime;return end(when);};
    return node;
  };
})();'''
FAKE_CLOCK = '''(() => { const base=Date.now(); window.__testTime=Number(localStorage.getItem('__moreiraQaClock'))||0; performance.now=()=>window.__testTime; Date.now=()=>base+window.__testTime; })();'''
def passed(name):
    results.append({'test':name,'status':'passed'})
    print('PASS:',name,flush=True)
def expect_round(page, number, timeout=5000):
    # Anchor the current-round numerator; '/ 02' alone must not satisfy round 2.
    expect(page.locator('#round-number')).to_have_text(re.compile(rf'^\s*{number:02d}\s*/'),timeout=timeout)
def advance(page, ms):
    page.evaluate('(ms) => { window.__testTime += ms; localStorage.setItem("__moreiraQaClock",String(window.__testTime)); }',ms)
    page.wait_for_timeout(190)
def choose_mode(page, mode='moreira'):
    expect(page.locator('#mode-screen')).to_be_visible()
    expect(page.locator('#mode-screen')).to_contain_text('QUAL MODO DESEJA INICIAR?')
    page.locator(f'#choose-{mode}').click()
    expect(page.locator('#mode-screen')).to_be_hidden()
    expect(page.locator('.app-shell')).to_be_visible()
def start_prepared(page):
    page.locator('#primary').click()
    expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
    advance(page,3000)
    expect(page.locator('#phase-label')).to_contain_text('LUTA')
def change_mode(page, mode):
    page.locator('#change-mode').click()
    choose_mode(page,mode)
def settings(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',SETTINGS_KEY)
def close_settings(page):
    if page.locator('#settings-dialog').is_visible(): page.locator('#close-settings').click()
def open_settings(page):
    page.locator('#open-settings').click()
    expect(page.locator('#settings-form')).to_be_visible()
def save_form(page):
    page.locator('#settings-form button[type="submit"]').click()
    page.wait_for_timeout(100)
def configure(page, fight=5, rest=5, rounds=2, preset=None):
    open_settings(page)
    for key,value in {'fightMinutes':fight//60,'fightSeconds':fight%60,'restMinutes':rest//60,'restSeconds':rest%60,'rounds':rounds}.items():
        page.locator(f'[name="{key}"]').fill(str(value))
    if preset is not None: page.locator('[name="audioPreset"]').select_option(preset)
    save_form(page)
    state=settings(page)
    assert state['training']=={'fight':fight,'rest':rest,'rounds':rounds,'preparation':3},repr(state['training'])
    close_settings(page)
def set_preset(page, preset):
    open_settings(page); page.locator('[name="audioPreset"]').select_option(preset)
    save_form(page); close_settings(page)
def open_secondary(page, target):
    open_settings(page)
    details=page.locator('details#library-data')
    if not details.evaluate('(el)=>el.open'): details.locator('summary').click()
    page.locator(target).click()
def click_quick(page, target):
    details=page.locator('details#quick-menu')
    if details.count() and not page.locator(target).is_visible(): details.locator('summary').click()
    page.locator(target).click()
    if details.count() and details.evaluate('(el)=>el.open'): details.locator('summary').click()
def end_workout(page):
    page.locator('#end').click(); page.locator('#confirm-yes').click()
    expect(page.locator('#phase-label')).to_contain_text('TREINO ENCERRADO')
def audio_count(page):
    return page.evaluate('window.__audioEvents.length')
def check_viewport(page, fullscreen=True):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'
    assert page.locator('#clock').evaluate('(el)=>el.scrollWidth <= el.clientWidth + 1'), 'Clock text overflow'
    bounds=page.locator('#clock').bounding_box(); panel=page.locator('#timer-panel').bounding_box()
    assert bounds['x'] >= panel['x']-1 and bounds['x']+bounds['width'] <= panel['x']+panel['width']+1,'Clock outside panel'
    primary=page.locator('#primary').bounding_box()
    assert primary['y']>=0 and primary['y']+primary['height']<=page.viewport_size['height']+2,'Primary control outside viewport'
    if fullscreen: assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 2'), 'Timer page requires vertical scrolling'
def check_update_controls(page, active):
    details=page.locator('details#quick-menu')
    if not details.evaluate('(el)=>el.open'): details.locator('summary').click()
    version=json.loads((ROOT/'package.json').read_text())['version']
    expect(page.locator('#app-version')).to_contain_text(version)
    if active: expect(page.locator('#update-app')).to_be_disabled()
    else: expect(page.locator('#update-app')).to_be_enabled()
    if details.evaluate('(el)=>el.open'): details.locator('summary').click()
def check_branding(page):
    expected=json.loads((ROOT/'dist/images/branding/catalog.json').read_text())['logoURL']
    expected_url=page.evaluate('(path)=>new URL(path,document.baseURI).href',expected)
    logo=page.locator('.topbar img[data-academy-logo]')
    expect(logo).to_be_visible()
    page.wait_for_function('document.querySelector(".topbar img[data-academy-logo]")?.naturalWidth > 0')
    assert logo.evaluate('(image)=>image.currentSrc || image.src')==expected_url
    dimensions=logo.evaluate('(image)=>({width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,fit:getComputedStyle(image).objectFit})')
    assert dimensions['height']>=40,repr(dimensions)
    ratio=dimensions['width']/dimensions['height']; natural_ratio=dimensions['naturalWidth']/dimensions['naturalHeight']
    assert dimensions['fit'] in ['contain','scale-down'] or abs(ratio-natural_ratio)/natural_ratio<.06,'Official logo distorted: '+repr(dimensions)
    mark=page.locator('img[data-academy-watermark]')
    expect(mark).to_be_visible()
    page.wait_for_function('document.querySelector("img[data-academy-watermark]")?.naturalWidth > 0')
    assert mark.evaluate('(image)=>image.currentSrc || image.src')==expected_url
    style=mark.evaluate('(image)=>({opacity:Number(getComputedStyle(image).opacity),pointerEvents:getComputedStyle(image).pointerEvents})')
    assert 0<style['opacity']<=.15 and style['pointerEvents']=='none',repr(style)
def no_phrases(page):
    assert page.locator('#phrase-wrap:visible,#rest-phrase:visible,#phrases-library:visible,#new-phrase:visible').count()==0,'A removed humor phrase is still visible'
def keep_state(page):
    return {'time':page.locator('#clock').inner_text(),'round':page.locator('#round-number').inner_text(),'phase':page.locator('#phase-label').inner_text()}
def assert_state(page, before):
    assert keep_state(page)==before,(before,keep_state(page))
def upload_item(page,name):
    return page.locator('.photo-item').filter(has=page.get_by_text(name,exact=True))
def run_tests(browser):
    context=browser.new_context(viewport={'width':1440,'height':900},service_workers='allow')
    context.add_init_script(FAKE_CLOCK); context.add_init_script(AUDIO_TRACE)
    page=context.new_page(); errors=[]; requests=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.on('request',lambda request: requests.append(request.url))
    page.on('dialog',lambda dialog: dialog.accept())
    page.goto(URL)
    expect(page.locator('#mode-screen')).to_be_visible(); expect(page.locator('.app-shell')).to_be_hidden()
    page.screenshot(path=str(ARTIFACTS/'minimal-mode-selection.png'),full_page=True)
    choose_mode(page,'moreira')
    assert audio_count(page)==0,'Mode choice must not play audio'
    passed('Nova abertura exige escolha de modo sem iniciar cronômetro ou tocar sons')
    expect(page.locator('#resenha-card')).to_be_hidden()
    check_branding(page); no_phrases(page)
    passed('Logo oficial legível no header e marca-d’água discreta usam o mesmo arquivo')
    check_update_controls(page,False)
    passed('Menu mostra versão do pacote e atualização disponível com treino inativo')
    check_viewport(page)
    page.screenshot(path=str(ARTIFACTS/'minimal-desktop.png'),full_page=True)
    passed('Modo Moreira mínimo: relógio gigante e controles no viewport sem humor')
    open_settings(page)
    expect(page.locator('[name="audioPreset"]')).to_be_visible()
    expect(page.locator('[name="audioPreset"]')).to_have_value('gym')
    passed('Instalação nova inicia com preset Academia, mantendo opção silenciosa disponível')
    assert page.locator('[name="preparation"]').count()==0,'Preparation must not add a sixth configurable control'
    assert page.locator('.settings-tabs:visible').count()==0,'Minimal settings must not expose category tabs'
    close_settings(page)
    configure(page,fight=5,rest=5,rounds=2,preset='normal')
    page.reload(); choose_mode(page,'moreira')
    expect(page.locator('#clock')).to_have_text('00:05')
    passed('Formulário único salva luta, descanso, rounds e som com preparação fixa em 3 segundos')
    page.locator('#primary').click()
    expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
    expect(page.locator('#clock')).to_have_text('00:03')
    check_update_controls(page,True)
    prep_color=page.locator('#timer-panel').evaluate('(el)=>getComputedStyle(el).backgroundColor.match(/[0-9]+/g).slice(0,3).map(Number)')
    page.screenshot(path=str(ARTIFACTS/'minimal-preparation.png'),full_page=True)
    advance(page,3000)
    expect(page.locator('#phase-label')).to_contain_text('LUTA')
    expect_round(page,1)
    fight_color=page.locator('#timer-panel').evaluate('(el)=>getComputedStyle(el).backgroundColor.match(/[0-9]+/g).slice(0,3).map(Number)')
    page.screenshot(path=str(ARTIFACTS/'minimal-fight.png'),full_page=True)
    passed('Início e preparação fixa de 3 segundos levam ao round 1')
    advance(page,1000); page.locator('#primary').click()
    before=keep_state(page); nodes_before=audio_count(page)
    check_update_controls(page,True)
    passed('Atualizar aplicativo permanece bloqueado durante treino pausado')
    advance(page,60000); assert_state(page,before)
    page.locator('#primary').click(); page.wait_for_timeout(100)
    assert audio_count(page)==nodes_before,'Resume replayed an old signal'
    passed('Pausa e retomada preservam o tempo sem repetir sinal do segundo atual')
    advance(page,4000)
    expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
    expect(page.locator('#resenha-card')).to_be_hidden()
    page.screenshot(path=str(ARTIFACTS/'minimal-rest.png'),full_page=True)
    passed('Luta muda automaticamente para descanso sem elementos de humor no Moreira')
    rest_color=page.locator('#timer-panel').evaluate('(el)=>getComputedStyle(el).backgroundColor.match(/[0-9]+/g).slice(0,3).map(Number)')
    ink=page.locator('#clock').evaluate('(el)=>getComputedStyle(el).color.match(/[0-9]+/g).slice(0,3).map(Number)')
    assert prep_color[0]>180 and prep_color[1]>140 and prep_color[2]<100,repr(prep_color)
    assert fight_color[1]>fight_color[0] and fight_color[1]>fight_color[2]*2,repr(fight_color)
    assert rest_color[0]>rest_color[1]*2 and rest_color[0]>rest_color[2]*2,repr(rest_color)
    assert max(ink)<40,repr(ink)
    passed('Amarelo na preparação, verde na luta e vermelho no descanso com números pretos')
    click_quick(page,'#tv-toggle'); page.set_viewport_size({'width':1920,'height':1080}); page.wait_for_timeout(200)
    check_viewport(page)
    page.screenshot(path=str(ARTIFACTS/'minimal-tv-1920x1080.png'),full_page=True)
    passed('Layout horizontal de televisão 1920x1080 sem menus ou rolagem')
    click_quick(page,'#tv-toggle'); page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(150)
    before=keep_state(page); check_viewport(page); check_branding(page)
    page.screenshot(path=str(ARTIFACTS/'minimal-mobile-390.png'),full_page=True)
    page.set_viewport_size({'width':844,'height':390}); page.wait_for_timeout(150)
    check_viewport(page); assert_state(page,before)
    page.screenshot(path=str(ARTIFACTS/'minimal-landscape-844.png'),full_page=True)
    passed('Giro do celular 390x844 → 844x390 preserva a sessão e mantém controles visíveis')
    page.set_viewport_size({'width':1440,'height':900})
    advance(page,5000); expect_round(page,2)
    advance(page,5000)
    expect(page.locator('#phase-label')).to_contain_text('TREINO FINALIZADO')
    expect(page.locator('#clock')).to_have_text('00:00'); expect(page.locator('#resenha-card')).to_be_hidden()
    passed('Último round para em zero e não cria descanso adicional')
    page.locator('#reset').click(); configure(page,fight=5,rest=3,rounds=10,preset='normal')
    start_prepared(page)
    rests=0
    for number in range(1,11):
        expect(page.locator('#phase-label')).to_contain_text('LUTA')
        expect_round(page,number)
        advance(page,5000)
        if number<10:
            expect(page.locator('#phase-label')).to_contain_text('DESCANSO'); rests+=1; advance(page,3000)
    expect(page.locator('#phase-label')).to_contain_text('TREINO FINALIZADO'); assert rests==9
    passed('Fluxo automático completo de 10 rounds e exatamente 9 descansos')
    change_mode(page,'bjj'); configure(page,fight=10,rest=10,rounds=2,preset='normal')
    open_secondary(page,'#open-library')
    base_photos=page.locator('.photo-item').count()
    assert base_photos>=5,'Expected the five supplied academy photos in the local catalog'
    catalog=json.loads((ROOT/'dist/images/athletes/catalog.json').read_text())['photos']
    assert len(catalog)==5,'Expected exactly the five supplied academy photos in this release'
    for photo in catalog:
        image=page.locator(f'[data-preview="{photo["id"]}"] img')
        expect(image).to_have_attribute('alt',photo['name'])
        image.scroll_into_view_if_needed()
        page.wait_for_function('(id)=>[...document.querySelectorAll("img")].some(image=>image.parentElement?.dataset.preview===id && image.naturalWidth>0)',arg=photo['id'])
    no_phrases(page)
    passed('As cinco fotos reais do catálogo estão presentes, identificadas e decodificadas')
    fixed_toggle=page.locator('[data-toggle-photo^="project-"]').first
    fixed_id=fixed_toggle.get_attribute('data-toggle-photo')
    fixed_article=page.locator('.photo-item').filter(has=page.locator(f'[data-toggle-photo="{fixed_id}"]'))
    assert fixed_article.locator('[data-delete-photo]').count()==0,'Bundled photos must not offer a misleading delete control'
    fixed_toggle.click()
    expect(page.locator(f'[data-toggle-photo="{fixed_id}"]')).to_have_attribute('aria-pressed','false')
    page.locator('#photo-upload').set_input_files([str(ROOT/'public/icons/icon-192.png'),str(ROOT/'public/icons/apple-touch-icon.png')])
    expect(page.locator('.photo-item')).to_have_count(base_photos+2)
    item=upload_item(page,'icon-192.png')
    item.locator('[data-toggle-photo]').click(); expect(item).to_have_class(__import__('re').compile('disabled'))
    item.locator('[data-toggle-photo]').click(); expect(item).not_to_have_class(__import__('re').compile('disabled'))
    item.locator('[data-preview]').click(); expect(page.locator('#photo-dialog')).to_be_visible(); page.locator('#close-photo').click()
    assert page.locator('#new-phrase').count()==0,'Phrase management must not remain in the photos-only library'
    no_phrases(page); close_settings(page)
    page.reload(); choose_mode(page,'bjj'); open_secondary(page,'#open-library')
    expect(page.locator('.photo-item')).to_have_count(base_photos+2)
    fixed_article=page.locator('.photo-item').filter(has=page.locator(f'[data-toggle-photo="{fixed_id}"]'))
    expect(fixed_article).to_have_class(__import__('re').compile('disabled'))
    assert fixed_article.locator('[data-delete-photo]').count()==0
    page.locator(f'[data-toggle-photo="{fixed_id}"]').click()
    expect(page.locator(f'[data-toggle-photo="{fixed_id}"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('.photo-item')).to_have_count(base_photos+2)
    close_settings(page)
    passed('Fotos incluídas podem ser desativadas/reativadas com persistência e sem exclusão enganosa')
    passed('Catálogo local e IndexedDB: adicionar, ativar, visualizar e persistir fotos')
    page.locator('#primary').click(); expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
    expect(page.locator('#rest-photo')).to_be_visible(); no_phrases(page)
    page.screenshot(path=str(ARTIFACTS/'minimal-bjj-preparation.png'),full_page=True)
    advance(page,3000); expect(page.locator('#phase-label')).to_contain_text('LUTA')
    expect(page.locator('#rest-photo')).to_be_visible(); no_phrases(page)
    advance(page,3000); expect(page.locator('#resenha-card')).to_be_hidden()
    advance(page,4000); expect(page.locator('#rest-photo')).to_be_visible()
    passed('Modo BJJ mostra foto na preparação e nas janelas inicial/final da luta; o meio fica limpo')
    advance(page,3000); expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
    expect(page.locator('#rest-photo')).to_be_visible(); no_phrases(page)
    original=page.locator('#rest-photo').get_attribute('src'); advance(page,1100)
    assert page.locator('#rest-photo').get_attribute('src')==original,'A three-second photo window should remain stable'
    check_viewport(page); check_branding(page)
    page.wait_for_function('document.querySelector("#rest-photo").naturalWidth > 0')
    page.screenshot(path=str(ARTIFACTS/'minimal-bjj-rest.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(350); check_viewport(page); check_branding(page)
    page.screenshot(path=str(ARTIFACTS/'minimal-bjj-mobile-390.png'),full_page=True)
    page.set_viewport_size({'width':1920,'height':1080}); page.wait_for_timeout(200); check_viewport(page); check_branding(page)
    clock_bounds=page.locator('#clock').bounding_box(); photo_bounds=page.locator('#resenha-card').bounding_box()
    assert clock_bounds['x']+clock_bounds['width'] <= photo_bounds['x'],'BJJ photo overlaps clock on TV'
    page.screenshot(path=str(ARTIFACTS/'minimal-bjj-tv-1920x1080.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':900})
    advance(page,1900); expect(page.locator('#resenha-card')).to_be_hidden()
    advance(page,4000); expect(page.locator('#rest-photo')).to_be_visible(); no_phrases(page)
    assert page.locator('#rest-photo').get_attribute('src')!=original,'Consecutive photo windows repeated the same photo'
    passed('Descanso BJJ usa fotos só nos primeiros/últimos três segundos sem cobrir o tempo ou exibir frases')
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('#resenha-card').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
    passed('Movimento reduzido prevalece sobre animações opcionais do Modo BJJ')
    click_quick(page,'#advance'); expect_round(page,2)
    advance(page,10000)
    expect(page.locator('#phase-label')).to_contain_text('TREINO FINALIZADO')
    expect(page.locator('#rest-photo')).to_be_visible(); no_phrases(page)
    passed('Final BJJ mantém somente a foto e o encerramento profissional, sem novo descanso ou frase')
    page.locator('#reset').click(); start_prepared(page); advance(page,1000)
    before=keep_state(page); count=audio_count(page)
    page.evaluate('document.dispatchEvent(new Event("visibilitychange"))'); page.wait_for_timeout(150)
    assert_state(page,before); expect(page.locator('#mode-screen')).to_be_hidden()
    assert audio_count(page)==count
    passed('Retorno de visibilidade mantém o treino e não mostra a escolha de modo')
    page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));")
    page.wait_for_timeout(350); assert_state(page,before); assert audio_count(page)==count
    passed('BFcache simulado recupera posse sem reiniciar, pausar ou repetir bipes')
    page.locator('#primary').click(); before=keep_state(page)
    click_quick(page,'#audio-reactivate'); assert_state(page,before); assert audio_count(page)==count
    page.locator('#primary').click(); page.wait_for_timeout(150)
    assert audio_count(page)==count
    page.locator('#primary').click()
    passed('Reativar áudio e continuar não zeram o relógio nem repetem sinais passados')
    page.reload(); choose_mode(page,'bjj')
    expect(page.locator('#restore-session')).to_be_visible(); page.locator('#restore-session').click()
    expect(page.locator('#phase-label')).to_contain_text('PAUSADO'); assert_state(page,before)
    passed('Nova abertura escolhe modo e recupera treino pausado com tempo e round preservados')
    second=context.new_page(); second.on('dialog',lambda dialog:dialog.accept()); second.on('pageerror',lambda error:errors.append(str(error)))
    second.goto(URL); choose_mode(second,'bjj')
    expect(second.locator('#restore-session')).to_be_visible(); second.locator('#restore-session').click(); second.wait_for_timeout(200)
    assert 'PAUSADO' not in second.locator('#phase-label').inner_text() and 'LUTA' not in second.locator('#phase-label').inner_text()
    expect(page.locator('#phase-label')).to_contain_text('PAUSADO'); second.close()
    passed('Outra aba não assume nem duplica um cronômetro já reservado')
    end_workout(page)
    open_secondary(page,'#open-library')
    upload_item(page,'icon-192.png').locator('[data-delete-photo]').click(); page.locator('#confirm-yes').click()
    expect(page.locator('.photo-item')).to_have_count(base_photos+1)
    no_phrases(page); close_settings(page)
    passed('Excluir um upload preserva as cinco fotos incluídas no catálogo')
    open_secondary(page,'#open-data')
    with page.expect_download() as download_info: page.locator('#export-settings').click()
    export_file=ARTIFACTS/'minimal-export.json'; download_info.value.save_as(str(export_file))
    data=json.loads(export_file.read_text()); data['training']['fight']=75
    import_file=ARTIFACTS/'minimal-import.json'; import_file.write_text(json.dumps(data))
    page.locator('#import-settings').set_input_files(str(import_file)); page.locator('#confirm-yes').click(); close_settings(page)
    expect(page.locator('#clock')).to_have_text('01:15')
    passed('Exportar e importar configurações continua acessível na área secundária')
    page.wait_for_function('navigator.serviceWorker.controller!==null',timeout=15000)
    assert page.evaluate("async()=>!!(await caches.match(new URL('index.html',location.href)))")
    context.set_offline(True); page.reload(wait_until='load'); choose_mode(page,'bjj')
    expect(page.locator('#clock')).to_have_text('01:15')
    open_secondary(page,'#open-library'); expect(page.locator('.photo-item')).to_have_count(base_photos+1); close_settings(page)
    start_prepared(page); expect(page.locator('#phase-label')).to_contain_text('LUTA'); end_workout(page)
    passed('Offline real: nova abertura, catálogo/fotos persistentes e início via Service Worker')
    context.set_offline(False)
    assert not errors,'JavaScript errors: '+repr(errors)
    assert all(url.startswith(URL.rstrip('/')) or url.startswith('blob:') or url.startswith('data:') for url in requests),'Unexpected external request'
    passed('Sem exceções JavaScript ou requisições de execução para serviços externos')
    context.close()
    # Chromium touch emulation is not an Android/Roku hardware certification.
    mobile_context=browser.new_context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True,device_scale_factor=2)
    mobile_context.add_init_script(AUDIO_TRACE)
    mobile=mobile_context.new_page(); mobile_errors=[]
    mobile.on('pageerror',lambda error:mobile_errors.append(str(error))); mobile.on('dialog',lambda dialog:dialog.accept())
    mobile.goto(URL); choose_mode(mobile,'moreira'); check_viewport(mobile); check_branding(mobile); no_phrases(mobile)
    mobile.screenshot(path=str(ARTIFACTS/'minimal-mobile-320.png'),full_page=True)
    passed('Tela mínima com toque em 320x740: tempo e ações cabem sem rolagem')
    configure(mobile,fight=4,rest=4,rounds=2,preset='normal')
    mobile.locator('#primary').click(); expect(mobile.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
    expect(mobile.locator('#phase-label')).to_contain_text('LUTA',timeout=5000)
    mobile.evaluate('window.__audioEvents=[]')
    expect(mobile.locator('#phase-label')).to_contain_text('DESCANSO',timeout=6500)
    expect_round(mobile,2,timeout=6500)
    tones=mobile.evaluate('window.__audioEvents.map(n=>n.end-n.start)')
    assert len(tones)==8,f'Expected 3+1 tones per fight/rest, got {tones}'
    for offset in [0,4]:
        assert all(0<length<.4 for length in tones[offset:offset+3]),repr(tones)
        assert .5<=tones[offset+3]<=1.2,repr(tones)
    mobile.locator('#primary').click(); before=keep_state(mobile); mobile.wait_for_timeout(1100); assert_state(mobile,before)
    passed('Relógio real e toque: 3 bipes curtos + 1 prolongado em luta e descanso, sem duplicação')
    open_settings(mobile); mobile.evaluate('window.__audioEvents=[]'); mobile.locator('#test-audio').click(); mobile.wait_for_timeout(3400)
    test_tones=mobile.evaluate('window.__audioEvents.map(n=>n.end-n.start)')
    assert len(test_tones)==4,repr(test_tones)
    assert all(0<x<.4 for x in test_tones[:3]) and .5<=test_tones[3]<=1.2,repr(test_tones)
    normal_long=test_tones[3]; close_settings(mobile)
    passed('Botão de teste reproduz três bipes curtos e um prolongado sem alterar sessão pausada')
    assert_state(mobile,before)
    set_preset(mobile,'gym'); open_settings(mobile); mobile.evaluate('window.__audioEvents=[]'); mobile.locator('#test-audio').click(); mobile.wait_for_timeout(3400)
    gym_tones=mobile.evaluate('window.__audioEvents.map(n=>n.end-n.start)')
    assert len(gym_tones)==4 and normal_long<gym_tones[-1]<=1.2,repr(gym_tones)
    close_settings(mobile); assert_state(mobile,before)
    passed('Preset Academia oferece sinal prolongado mais marcante sem alterar tempo ou rounds')
    set_preset(mobile,'silent'); count=audio_count(mobile)
    mobile.locator('#primary').click(); mobile.wait_for_timeout(1200)
    assert audio_count(mobile)==count,'Muted workout played audio'; end_workout(mobile)
    mobile.reload(); choose_mode(mobile,'moreira'); open_settings(mobile)
    expect(mobile.locator('[name="audioPreset"]')).to_have_value('silent'); close_settings(mobile)
    passed('Preset silencioso desativa bipes sem interromper o treino e persiste em nova abertura')
    configure(mobile,fight=30,rest=5,rounds=2,preset='normal')
    open_settings(mobile); mobile.evaluate('window.__audioEvents=[]'); mobile.locator('#test-audio').click(); mobile.wait_for_timeout(200)
    close_settings(mobile); mobile.locator('#primary').click()
    expect(mobile.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
    # The preview sequence is cancelled on start; only the training's own countdown
    # remains. After 3.4s there are 3 prep beeps and its zero, not both sequences.
    mobile.evaluate('window.__audioEvents=[]'); mobile.wait_for_timeout(3400)
    preview_after_start=mobile.evaluate('window.__audioEvents.map(n=>n.end-n.start)')
    assert len(preview_after_start)<=3,repr(preview_after_start)
    expect(mobile.locator('#phase-label')).to_contain_text('LUTA'); end_workout(mobile)
    passed('Iniciar cancela a sequência de teste pendente e evita bipes extras no treino')
    assert not mobile_errors,repr(mobile_errors)
    mobile_context.close()
    # Legacy installs must receive the louder default once, without changing
    # workout values or overriding explicit Normal/Silent selections.
    legacy_data=json.loads(json.dumps(data))
    legacy_data['training']={'fight':127,'rest':47,'rounds':9,'preparation':3}
    legacy_data['audio']={'enabled':True,'volume':65,'musicCompatibility':True,'sirens':True,'countdown':True,'lastTen':True,'returnCue':True,'funny':False}
    legacy_context=browser.new_context(viewport={'width':390,'height':844})
    legacy_context.add_init_script('if (!localStorage.getItem('+json.dumps(SETTINGS_KEY)+')) localStorage.setItem('+json.dumps(SETTINGS_KEY)+',JSON.stringify('+json.dumps(legacy_data)+'));')
    legacy=legacy_context.new_page(); legacy.on('dialog',lambda dialog:dialog.accept())
    legacy.goto(URL); choose_mode(legacy,'moreira'); open_settings(legacy)
    expect(legacy.locator('[name="audioPreset"]')).to_have_value('gym')
    assert settings(legacy)['training']==legacy_data['training']
    close_settings(legacy)
    passed('Instalação antiga com volume padrão recebe Academia sem alterar luta, descanso ou rounds')
    set_preset(legacy,'normal'); legacy.reload(); choose_mode(legacy,'moreira'); open_settings(legacy)
    expect(legacy.locator('[name="audioPreset"]')).to_have_value('normal'); close_settings(legacy)
    passed('Escolha explícita de Normal é preservada após a migração e nova abertura')
    legacy_context.close()
    silent_data=json.loads(json.dumps(legacy_data)); silent_data['audio']['enabled']=False; silent_data['audio']['volume']=0
    silent_context=browser.new_context(viewport={'width':390,'height':844})
    silent_context.add_init_script('if (!localStorage.getItem('+json.dumps(SETTINGS_KEY)+')) localStorage.setItem('+json.dumps(SETTINGS_KEY)+',JSON.stringify('+json.dumps(silent_data)+'));')
    silent= silent_context.new_page(); silent.goto(URL); choose_mode(silent,'moreira'); open_settings(silent)
    expect(silent.locator('[name="audioPreset"]')).to_have_value('silent')
    assert settings(silent)['audio']['enabled'] is False
    close_settings(silent); silent_context.close()
    passed('Migração de instalação antiga respeita modo silencioso já escolhido')
try:
    server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(PORT)},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    for _ in range(50):
        try:
            connection=HTTPConnection('127.0.0.1',PORT,timeout=1); connection.request('GET','/'); response=connection.getresponse()
            if response.status==200: break
        except OSError: time.sleep(.1)
    else: raise RuntimeError('Local test server did not start')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try: run_tests(browser)
        finally: browser.close()
except Exception as error:
    results.append({'test':'browser execution','status':'failed','error':str(error)})
    print('FAIL:',str(error),flush=True)
    raise
finally:
    payload=json.dumps(results,ensure_ascii=False,indent=2)
    (ARTIFACTS/'browser-minimal-results.json').write_text(payload)
    (ARTIFACTS/'browser-results.json').write_text(payload)
    if server:
        server.terminate()
        try: server.wait(timeout=4)
        except subprocess.TimeoutExpired: server.kill()
