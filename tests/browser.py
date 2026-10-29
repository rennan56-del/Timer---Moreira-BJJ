"""Optional QA using preinstalled Playwright and Chromium; no downloads.
Run after building: python3 tests/browser.py
Touch emulation and synthetic suspension do not certify Android/Roku hardware.
"""
from pathlib import Path
from http.client import HTTPConnection
import subprocess, os, time, json, re
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
PORT = 4184
URL = f'http://127.0.0.1:{PORT}/'
server = subprocess.Popen(['node','scripts/serve.mjs'], cwd=ROOT, env={**os.environ,'PORT':str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
results = []
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
FAKE_CLOCK = '''(() => { const base=Date.now(); window.__testTime=0; performance.now=()=>window.__testTime; Date.now=()=>base+window.__testTime; })();'''
def passed(name):
    results.append({'test':name,'status':'passed'})
    print('PASS:',name,flush=True)
def expect_round(page, number, timeout=5000):
    # Anchor the current-round numerator; '/ 02' alone must not satisfy round 2.
    expect(page.locator('#round-number')).to_have_text(re.compile(rf'^\s*{number:02d}\s*/'),timeout=timeout)
def advance(page, ms):
    page.evaluate('(ms) => { window.__testTime += ms; }',ms)
    page.wait_for_timeout(190)
def choose_mode(page, mode='bjj'):
    expect(page.locator('#mode-screen')).to_be_visible()
    expect(page.locator('#mode-screen')).to_contain_text('QUAL MODO DESEJA INICIAR?')
    page.locator(f'#choose-{mode}').click()
    expect(page.locator('#mode-screen')).to_be_hidden()
    expect(page.locator('.app-shell')).to_be_visible()
def change_mode(page, mode):
    page.locator('#change-mode').click()
    choose_mode(page,mode)
def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal page overflow'
    assert page.locator('#clock').evaluate('(el)=>el.scrollWidth <= el.clientWidth + 1'),'Clock text overflow'
    bounds=page.locator('#clock').bounding_box()
    panel=page.locator('#timer-panel').bounding_box()
    assert bounds['x'] >= panel['x']-1 and bounds['x']+bounds['width'] <= panel['x']+panel['width']+1,'Clock outside panel'
def configure(page, fight=5, rest=5, rounds=2, preparation=3):
    page.locator('#open-settings').click()
    page.locator('[data-tab="training"]').click()
    for key,value in {'fightMinutes':0,'fightSeconds':fight,'restMinutes':0,'restSeconds':rest,'rounds':rounds,'preparation':preparation}.items():
        page.locator(f'[name="{key}"]').fill(str(value))
    page.locator('#settings-form button[type="submit"]').click()
    expect(page.locator('#toast')).to_contain_text('Configurações salvas')
    page.locator('#close-settings').click()
def end_workout(page):
    page.locator('#end').click(); page.locator('#confirm-yes').click()
    expect(page.locator('#phase-label')).to_contain_text('TREINO ENCERRADO')
def audio_count(page):
    return page.evaluate('window.__audioEvents.length')
def dismiss_beforeunload(dialog):
    dialog.accept()
try:
    for _ in range(50):
        try:
            connection=HTTPConnection('127.0.0.1',PORT,timeout=1)
            connection.request('GET','/'); response=connection.getresponse()
            if response.status==200: break
        except OSError: time.sleep(.1)
    else: raise RuntimeError('Local test server did not start')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':1080},service_workers='allow')
        context.add_init_script(FAKE_CLOCK)
        context.add_init_script(AUDIO_TRACE)
        page=context.new_page(); errors=[]; requests=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('request',lambda request: requests.append(request.url))
        page.on('dialog',dismiss_beforeunload)
        page.goto(URL)
        expect(page.locator('#mode-screen')).to_be_visible()
        expect(page.locator('.app-shell')).to_be_hidden()
        page.screenshot(path=str(ARTIFACTS/'mode-selection.png'),full_page=True)
        choose_mode(page)
        passed('Nova abertura exige escolha explícita entre Modo Moreira e Modo BJJ')
        expect(page.locator('#clock')).to_have_text('05:00')
        expect(page.locator('#connection')).to_contain_text('Pronto para offline',timeout=15000)
        page.screenshot(path=str(ARTIFACTS/'desktop.png'),full_page=True)
        passed('Desktop: inicialização e cache offline completo')
        configure(page)
        page.reload(); choose_mode(page)
        expect(page.locator('#stat-fight')).to_have_text('00:05')
        passed('Persistência real de configurações e escolha de modo em nova abertura')
        page.locator('[data-open-tab="humor"]').click()
        page.locator('#photo-upload').set_input_files([str(ROOT/'public/icons/icon-192.png'),str(ROOT/'public/icons/apple-touch-icon.png')])
        expect(page.locator('.photo-item')).to_have_count(2)
        expect(page.locator('#toast')).to_contain_text('2 foto(s) adicionada(s)')
        page.locator('[name="photoDuration"]').fill('1')
        page.locator('[name="photosPerRest"]').fill('2')
        page.locator('#settings-form button[type="submit"]').click()
        page.locator('#new-phrase').fill('O tatame também sorri!')
        page.locator('#add-phrase button').click()
        expect(page.locator('.phrase-item')).to_have_count(47)
        page.locator('.phrase-item').last.locator('[name="text"]').fill('Bora pro próximo round!')
        page.locator('.phrase-item').last.locator('[type="submit"]').click()
        page.locator('.phrase-item').last.locator('[name="enabled"]').uncheck()
        page.locator('[data-toggle-photo]').first.click()
        expect(page.locator('.photo-item.disabled')).to_have_count(1)
        page.locator('[data-toggle-photo]').first.click()
        expect(page.locator('.photo-item.disabled')).to_have_count(0)
        page.locator('[data-preview]').first.click()
        expect(page.locator('#photo-dialog')).to_be_visible()
        page.locator('#close-photo').click(); page.locator('#close-settings').click()
        page.reload(); choose_mode(page)
        page.locator('[data-open-tab="humor"]').click()
        expect(page.locator('.photo-item')).to_have_count(2)
        expect(page.locator('.phrase-item')).to_have_count(47)
        page.locator('#close-settings').click()
        passed('IndexedDB: importar, visualizar, ativar e persistir fotos; criar/editar/desativar frase')
        page.locator('#primary').click()
        expect(page.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
        advance(page,3000)
        expect(page.locator('#phase-label')).to_contain_text('LUTA')
        passed('Início de treino e contagem preparatória')
        page.locator('#primary').click()
        expect(page.locator('#phase-label')).to_contain_text('PAUSADO')
        frozen=page.locator('#clock').inner_text()
        advance(page,30000)
        expect(page.locator('#clock')).to_have_text(frozen)
        page.locator('#primary').click()
        expect(page.locator('#phase-label')).not_to_contain_text('PAUSADO')
        passed('Pausa/retomada sem consumir tempo em pausa')
        advance(page,5000)
        expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
        expect(page.locator('#resenha-card')).to_be_visible()
        expect(page.locator('#rest-photo')).to_be_visible()
        expect(page.locator('#rest-phrase')).not_to_be_empty()
        initial_photo=page.locator('#rest-photo').get_attribute('src')
        page.screenshot(path=str(ARTIFACTS/'rest-desktop.png'),full_page=True)
        advance(page,1100)
        assert page.locator('#rest-photo').get_attribute('src') != initial_photo,'Photo did not change without repetition'
        passed('Modo BJJ: luta → descanso, fotos alternadas e frases sem cobrir relógio')
        page.locator('#advance').click()
        expect_round(page,2)
        expect(page.locator('#phase-label')).to_contain_text('LUTA')
        advance(page,5000)
        expect(page.locator('#phase-label')).to_contain_text('TREINO FINALIZADO')
        expect(page.locator('#clock')).to_have_text('00:00')
        expect(page.locator('#rest-photo')).to_be_visible()
        expect(page.locator('#rest-phrase')).not_to_be_empty()
        passed('Último round encerra sem descanso adicional e BJJ exibe foto/mensagem final')
        page.locator('#reset').click()
        configure(page,fight=10,rest=10,rounds=3,preparation=0)
        page.locator('#primary').click(); advance(page,10000)
        expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
        page.locator('#tv-toggle').click()
        page.set_viewport_size({'width':1920,'height':1080}); page.wait_for_timeout(500)
        no_overflow(page)
        clock_box=page.locator('#clock').bounding_box(); photo_box=page.locator('#resenha-card').bounding_box()
        assert clock_box['x']+clock_box['width'] <= photo_box['x'], 'TV clock overlaps resenha'
        assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'),'TV vertical overflow'
        page.screenshot(path=str(ARTIFACTS/'tv-1920x1080.png'),full_page=True)
        passed('Layout TV horizontal 1920x1080, resenha e relógio em áreas separadas')
        page.locator('#tv-toggle').click()
        page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(200)
        no_overflow(page)
        expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
        expect_round(page,1)
        page.screenshot(path=str(ARTIFACTS/'mobile-rest.png'),full_page=True)
        passed('Mudança de orientação/layout para 390x844 preserva treino e não cria overflow')
        page.emulate_media(reduced_motion='reduce')
        assert page.locator('#resenha-card').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
        passed('Preferência de movimento reduzido respeitada')
        page.evaluate('window.__testTime += 26000')
        page.evaluate('document.dispatchEvent(new Event("visibilitychange"))'); page.wait_for_timeout(150)
        expect_round(page,2)
        expect(page.locator('#phase-label')).to_contain_text('DESCANSO')
        expect(page.locator('#mode-screen')).to_be_hidden()
        passed('Retorno de visibilidade recupera fase/round sem interromper com seleção de modo')
        bfcache_before={'time':page.locator('#clock').inner_text(),'round':page.locator('#round-number').inner_text(),'phase':page.locator('#phase-label').inner_text(),'audio':audio_count(page)}
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));")
        page.wait_for_timeout(350)
        assert page.locator('#clock').inner_text()==bfcache_before['time']
        assert page.locator('#round-number').inner_text()==bfcache_before['round']
        assert page.locator('#phase-label').inner_text()==bfcache_before['phase']
        expect(page.locator('#mode-screen')).to_be_hidden()
        assert audio_count(page)==bfcache_before['audio'],'BFcache recovery repeated a round signal'
        passed('BFcache simulado: pagehide/visibilidade/pageshow recuperam controle sem pausa ou sinal duplicado')
        end_workout(page); page.locator('#reset').click()
        change_mode(page,'moreira')
        expect(page.locator('.personality-bar')).to_be_hidden()
        assert page.evaluate('document.body.classList.contains("no-motion")'),'Moreira should disable unnecessary animation'
        page.locator('#primary').click(); advance(page,10000)
        expect(page.locator('#resenha-card')).to_be_hidden()
        end_workout(page)
        passed('Modo Moreira sem fotos, frases, seletor de humor e animações desnecessárias')
        page.locator('#open-settings').click(); page.locator('[data-tab="audio"]').click()
        page.locator('#test-audio').click()
        expect(page.locator('#audio-status')).to_contain_text('Áudio habilitado')
        page.locator('#close-settings').click()
        passed('Web Audio no Chromium por clique (audibilidade física não avaliada)')
        change_mode(page,'bjj')
        page.locator('[data-open-tab="humor"]').click()
        page.locator('[data-delete-photo]').first.click(); page.locator('#confirm-yes').click()
        expect(page.locator('.photo-item')).to_have_count(1)
        page.locator('[data-delete-phrase]').last.click(); page.locator('#confirm-yes').click()
        expect(page.locator('.phrase-item')).to_have_count(46)
        page.locator('#close-settings').click()
        passed('Exclusão real de foto no IndexedDB e frase nas configurações')
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        context.set_offline(True)
        page.reload(wait_until='load'); choose_mode(page)
        expect(page.locator('#clock')).to_be_visible()
        expect(page.locator('#connection')).to_contain_text('Offline · pronto para treinar')
        page.locator('[data-open-tab="humor"]').click()
        expect(page.locator('.photo-item')).to_have_count(1)
        page.locator('#close-settings').click(); page.locator('#primary').click()
        expect(page.locator('#phase-label')).to_contain_text('LUTA')
        passed('Offline real: nova abertura, fotos persistentes e início de treino via Service Worker')
        end_workout(page)
        context.set_offline(False)
        assert not errors, 'Browser JavaScript errors: '+repr(errors)
        assert all(url.startswith(URL.rstrip('/')) or url.startswith('blob:') or url.startswith('data:') for url in requests),'Unexpected external request'
        passed('Sem exceções JavaScript ou requisições a serviços externos')
        # Shared-duration settings apply to both entry modes. Diagnostics must not touch the engine.
        page.locator('#reset').click(); change_mode(page,'moreira')
        configure(page,fight=5,rest=5,rounds=2,preparation=0)
        page.locator('#primary').click(); advance(page,2000)
        expect(page.locator('#clock')).to_have_text('00:03')
        page.locator('#primary').click()
        before={'time':page.locator('#clock').inner_text(),'round':page.locator('#round-number').inner_text()}
        nodes_before=audio_count(page)
        page.locator('#audio-reactivate').click()
        expect(page.locator('#audio-status')).to_contain_text('Áudio habilitado')
        assert page.locator('#clock').inner_text()==before['time'] and page.locator('#round-number').inner_text()==before['round']
        assert audio_count(page)==nodes_before,'Audio recovery must not emit an extra round signal'
        page.locator('#primary').click(); page.wait_for_timeout(150)
        assert audio_count(page)==nodes_before,'Pause/resume must not replay the 3-second signal'
        page.locator('#primary').click()
        passed('Reativar áudio e pausar/retomar preservam relógio/round sem repetir sinal do segundo atual')
        nodes_before=audio_count(page)
        page.locator('#test-short').click(); page.wait_for_timeout(200)
        short_nodes=page.evaluate('window.__audioEvents.slice(-1)')
        assert audio_count(page)>nodes_before
        assert short_nodes[0]['end']-short_nodes[0]['start']<.4
        page.locator('#test-long').click(); page.wait_for_timeout(200)
        long_nodes=page.evaluate('window.__audioEvents.slice(-1)')
        assert long_nodes[0]['end']-long_nodes[0]['start']>=.5
        passed('Diagnóstico reproduz bip curto e prolongado distinguíveis em Web Audio real')
        page.locator('#music-mode').uncheck(); page.locator('#music-mode').check()
        expect(page.locator('#music-mode')).to_be_checked()
        end_workout(page)
        page.reload(); choose_mode(page,'moreira')
        expect(page.locator('#music-mode')).to_be_checked()
        passed('Compatibilidade com música persiste (mistura física com outro aplicativo não avaliada)')
        configure(page,fight=5,rest=3,rounds=10,preparation=3)
        page.locator('#primary').click(); advance(page,3000)
        rests=0
        for number in range(1,11):
            expect(page.locator('#phase-label')).to_contain_text('LUTA')
            expect_round(page,number)
            advance(page,5000)
            if number<10:
                expect(page.locator('#phase-label')).to_contain_text('DESCANSO'); rests+=1
                advance(page,3000)
        expect(page.locator('#phase-label')).to_contain_text('TREINO FINALIZADO')
        expect(page.locator('#clock')).to_have_text('00:00')
        expect(page.locator('#resenha-card')).to_be_hidden()
        assert rests==9
        passed('Sequência automática de 10 rounds e 9 descansos, finalização no Modo Moreira')
        context.close()
        # Touch/mobile emulation is Chromium; this does not certify Android or Safari/iOS.
        mobile_context=browser.new_context(viewport={'width':320,'height':740},is_mobile=True,has_touch=True,device_scale_factor=2)
        mobile_context.add_init_script(AUDIO_TRACE)
        mobile=mobile_context.new_page(); mobile_errors=[]
        mobile.on('pageerror',lambda error: mobile_errors.append(str(error)))
        mobile.on('dialog',dismiss_beforeunload)
        mobile.goto(URL); choose_mode(mobile,'moreira')
        expect(mobile.locator('#clock')).to_have_text('05:00')
        no_overflow(mobile)
        mobile.screenshot(path=str(ARTIFACTS/'mobile-320.png'),full_page=True)
        passed('Chromium touch: viewport 320 px sem overflow')
        expect(mobile.locator('#audio-status')).to_contain_text('Áudio habilitado')
        assert audio_count(mobile)==0, 'Choosing a mode must not play a sound'
        mobile.locator('#primary').click()
        expect(mobile.locator('#phase-label')).to_contain_text('PREPARAÇÃO')
        expect(mobile.locator('#audio-status')).to_contain_text('Áudio habilitado')
        mobile.wait_for_timeout(3200)
        expect(mobile.locator('#phase-label')).to_contain_text('LUTA')
        mobile.locator('#primary').click()
        time_before=mobile.locator('#clock').inner_text()
        mobile.wait_for_timeout(1100)
        expect(mobile.locator('#clock')).to_have_text(time_before)
        end_workout(mobile)
        passed('Relógio real: preparação, pausa e áudio por toque no Chromium mobile')
        configure(mobile,fight=4,rest=4,rounds=2,preparation=0)
        mobile.locator('#primary').click(); mobile.wait_for_timeout(150)
        mobile.evaluate('window.__audioEvents=[]')
        expect(mobile.locator('#phase-label')).to_contain_text('DESCANSO',timeout=6500)
        expect_round(mobile,2,timeout=6500)
        stage_signals=mobile.evaluate('window.__audioEvents.map(n=>n.end-n.start)')
        assert len(stage_signals)==8, f'Expected 3+1 cues per fight/rest, got {stage_signals}'
        for offset in [0,4]:
            assert all(0<duration<.4 for duration in stage_signals[offset:offset+3]),repr(stage_signals)
            assert stage_signals[offset+3]>=.5,repr(stage_signals)
        end_workout(mobile)
        passed('Relógio real: três bipes curtos e um prolongado em luta e descanso, sem duplicação')
        mobile.locator('#open-settings').click(); mobile.locator('[data-tab="appearance"]').click()
        mobile.locator('[name="scale"]').fill('125'); mobile.locator('[name="fightColor"]').fill('#f4ffdc')
        mobile.locator('#settings-form button[type="submit"]').click(); mobile.locator('#close-settings').click()
        no_overflow(mobile)
        assert mobile.locator('#timer-panel').evaluate('(el)=>el.classList.contains("light-phase")')
        passed('Escala 125% e adaptação do contraste para fundo claro em 320 px')
        mobile.locator('#open-settings').click(); mobile.locator('[data-tab="data"]').click()
        with mobile.expect_download() as download_info: mobile.locator('#export-settings').click()
        downloaded=download_info.value
        export_file=ARTIFACTS/'export-test.json'; downloaded.save_as(str(export_file))
        exported=json.loads(export_file.read_text()); assert exported['appearance']['scale']==125
        exported['training']['fight']=75
        import_file=ARTIFACTS/'import-test.json'; import_file.write_text(json.dumps(exported))
        mobile.locator('#import-settings').set_input_files(str(import_file)); mobile.locator('#confirm-yes').click()
        expect(mobile.locator('#stat-fight')).to_have_text('01:15')
        mobile.locator('#close-settings').click()
        passed('Exportação/download e importação real de configurações JSON')
        mobile.locator('#tv-toggle').click(); mobile.set_viewport_size({'width':844,'height':390}); mobile.wait_for_timeout(200)
        no_overflow(mobile)
        assert mobile.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'),'Landscape TV overflow'
        passed('Modo TV horizontal compacto 844x390 com escala máxima')
        mobile.locator('#tv-toggle').click(); mobile.set_viewport_size({'width':390,'height':844})
        mobile.locator('#reset').click(); configure(mobile,fight=30,rest=5,rounds=2,preparation=0)
        # Muting remains compatible with a functioning timer.
        mobile.locator('#open-settings').click(); mobile.locator('[data-tab="audio"]').click()
        mobile.locator('[name="audioEnabled"]').uncheck()
        mobile.locator('#settings-form button[type="submit"]').click(); mobile.locator('#close-settings').click()
        nodes_before=audio_count(mobile)
        mobile.locator('#primary').click(); mobile.wait_for_timeout(1100)
        expect(mobile.locator('#phase-label')).to_contain_text('LUTA')
        assert audio_count(mobile)==nodes_before,'Muted workout emitted audio'
        mobile.locator('#primary').click()
        paused_time=mobile.locator('#clock').inner_text()
        passed('Modo silencioso mantém o cronômetro funcional sem emitir áudio')
        # Reload is a new opening, but an explicit session recovery preserves a paused timer.
        mobile.reload(); choose_mode(mobile,'moreira')
        expect(mobile.locator('#restore-session')).to_be_visible()
        mobile.locator('#restore-session').click()
        expect(mobile.locator('#phase-label')).to_contain_text('PAUSADO')
        expect(mobile.locator('#clock')).to_have_text(paused_time)
        expect_round(mobile,1)
        passed('Nova abertura escolhe modo e recupera treino pausado sem zerar tempo/round')
        second=mobile_context.new_page(); second.on('dialog',dismiss_beforeunload)
        second.on('pageerror',lambda error: mobile_errors.append(str(error)))
        second.goto(URL); choose_mode(second,'moreira')
        if second.locator('#restore-session').is_visible() and second.locator('#restore-session').is_enabled(): second.locator('#restore-session').click()
        elif second.locator('#primary').is_enabled(): second.locator('#primary').click()
        second.wait_for_timeout(200)
        assert 'PAUSADO' not in second.locator('#phase-label').inner_text() and 'LUTA' not in second.locator('#phase-label').inner_text(),'Second page acquired an already owned workout'
        expect(mobile.locator('#phase-label')).to_contain_text('PAUSADO')
        passed('Segunda aba não inicia nem recupera cronômetro já pertencente à primeira')
        second.close(); end_workout(mobile)
        assert not mobile_errors,repr(mobile_errors)
        mobile_context.close(); browser.close()
except Exception as error:
    results.append({'test':'browser execution','status':'failed','error':str(error)})
    print('FAIL:',str(error),flush=True)
    raise
finally:
    (ARTIFACTS/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    server.terminate()
    try: server.wait(timeout=4)
    except subprocess.TimeoutExpired: server.kill()
