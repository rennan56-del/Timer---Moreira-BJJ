import { PROTOCOLS } from '../core/protocols.js';
import { icon } from './icons.js';
const brand = (large = false) => `<${large ? 'div' : 'button type="button" id="home-brand" aria-label="Voltar à seleção de modos" title="Voltar à seleção de modos"'} class="brand ${large ? 'brand-large' : 'brand-header'}"><img class="academy-logo" data-academy-logo alt="Logo oficial Moreira BJJ Academy" hidden/><span class="brand-name">MOREIRA <b>BJJ</b><small>ACADEMY · TIMER</small></span></${large ? 'div' : 'button'}>`;
export function layout(): string {
  return `
  <section id="mode-screen" class="mode-screen" aria-labelledby="mode-title">
    ${brand(true)}
    <h1 id="mode-title">QUAL MODO DESEJA INICIAR?</h1>
    <div class="mode-choices">
      <button id="choose-moreira" class="mode-choice"><span>01</span><strong>MODO MOREIRA</strong><small>Foco no treino. Precisão em cada round.</small>${icon('play')}</button>
      <button id="choose-bjj" class="mode-choice bjj-choice"><span>02</span><strong>MODO BJJ</strong><small>O mesmo treino. As fotos da academia.</small>${icon('play')}</button>
    </div>
    <span id="gate-status" class="gate-status">Preparando o aplicativo…</span>
  </section>
  <a class="skip-link" href="#timer-panel">Ir para o cronômetro</a>
  <div class="app-shell" hidden>
    <header class="topbar">
      ${brand()}
      <button id="change-mode" class="mode-label">MODO MOREIRA</button>
      <nav class="header-actions" aria-label="Controles de exibição">
        <button id="tv-toggle" class="icon-button" aria-label="Modo TV" title="Modo TV" aria-pressed="false">${icon('tv')}<span class="sr-only">Modo TV</span></button>
        <button id="open-settings" class="icon-button" aria-label="Abrir configurações" title="Configurações">${icon('settings')}</button>
        <details id="quick-menu" class="quick-menu"><summary aria-label="Mais opções">•••</summary><div class="quick-menu-body">
          <button id="fullscreen">${icon('fullscreen')} Tela cheia</button>
          <button id="audio-reactivate">${icon('sound')} Reativar áudio</button>
          <button id="advance" disabled>${icon('next')}<span>Avançar round</span></button>
          <button id="install" hidden>${icon('download')} Instalar aplicativo</button>
          <button id="update-app">Atualizar aplicativo</button><span id="app-version" class="app-version"></span><span id="asset-status" class="asset-status"></span><button id="help-toggle">Ajuda para Android / Roku</button>
          <span id="connection" class="connection">Preparando offline…</span>
          <button id="recover-lock" hidden>Liberar bloqueio antigo</button>
        </div></details>
      </nav>
    </header>
    <main>
      <section id="restore-banner" class="restore-banner" hidden aria-label="Recuperar treino"><div><strong>Continuar seu último treino?</strong><p id="restore-description"></p></div><div class="restore-actions"><button id="restore-session" class="button primary">Recuperar</button><button id="discard-session" class="button secondary">Descartar</button></div></section>
      <section id="timer-panel" class="timer-panel" aria-label="Cronômetro de treino" data-phase="fight" tabindex="-1">
        <img class="academy-watermark" data-academy-logo data-academy-watermark alt="" aria-hidden="true" hidden/><div class="panel-top"><div class="protocol-control"><label for="protocol-select" class="sr-only">Treino personalizado</label><select id="protocol-select"><option value="" disabled>Treino personalizado</option>${Object.entries(PROTOCOLS).map(([id,p]) => `<option value="${id}">${p.name}</option>`).join('')}<option value="manual">Sair do treino personalizado</option></select><span id="protocol-stage" hidden></span></div><span class="round-badge">ROUND <strong id="round-number">01 <span>/ 05</span></strong></span><span id="phase-label" class="phase-label">PRONTO</span></div>
        <div class="timer-content">
          <div class="clock-block"><span id="clock-caption" class="clock-caption sr-only">TEMPO DE LUTA</span><div id="clock" class="clock" role="timer" aria-label="Tempo restante" aria-live="off">05:00</div><span id="clock-note" class="clock-note sr-only"></span></div>
          <aside id="resenha-card" class="resenha-card" hidden aria-label="Fotos no início e no fim da contagem"><div id="photo-wrap" class="photo-wrap" hidden><img id="rest-photo" alt="Foto da academia"/></div></aside>
        </div>
        <div class="progress-track" aria-hidden="true"><div id="phase-progress"></div></div>
      </section>
      <div class="transport" aria-label="Controles do treino">
        <button id="reset" class="transport-secondary" aria-label="Reiniciar treino">${icon('reset')}<span>Reiniciar</span></button>
        <button id="primary" class="start-button">${icon('play')}<span>Iniciar</span></button>
        <button id="end" class="transport-secondary" disabled aria-label="Encerrar treino">${icon('stop')}<span>Encerrar</span></button>
      </div>
      <div id="help" class="help-box" hidden><p><strong>Android → Roku:</strong> use o espelhamento compatível do seu aparelho, gire a tela e ative Modo TV. A PWA roda no celular; a Roku recebe o espelhamento.</p><p><strong>Som:</strong> teste com a música tocando. Se o Android suspender os bipes, use “Reativar áudio” no menu •••. Isso preserva tempo e rounds. O sistema pode reduzir ou pausar a música.</p><p><strong>Offline:</strong> use HTTPS e aguarde “Pronto para offline” no menu. No Android, instale pelo navegador. A tela é mantida ativa quando Wake Lock está disponível.</p></div>
    </main>
    <span id="audio-status" class="sr-only"></span><span id="wake-status" class="sr-only"></span>
  </div>
  <div id="announcer" class="sr-only" role="status" aria-live="polite"></div>
  <div id="toast" class="toast" role="status" hidden></div>
  <dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title"><div class="dialog-heading"><div><span class="eyebrow">DO SEU JEITO</span><h2 id="settings-title">Configurações</h2></div><button id="close-settings" class="button icon-button ghost" aria-label="Fechar configurações">${icon('close')}</button></div><nav hidden class="settings-tabs" aria-label="Categorias de configurações"><button data-tab="training">Treino</button><button data-tab="appearance">Aparência</button><button data-tab="humor">Humor</button><button data-tab="audio">Áudio</button><button data-tab="data">Dados</button></nav><div id="settings-body" class="settings-body"></div></dialog>
  <dialog id="confirm-dialog" class="confirm-dialog" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirmar ação</h2><p id="confirm-text"></p><div class="dialog-actions"><button id="confirm-no" class="button secondary">Cancelar</button><button id="confirm-yes" class="button primary">Confirmar</button></div></dialog>
  <dialog id="photo-dialog" class="photo-dialog" aria-label="Visualizar foto"><button id="close-photo" class="button icon-button" aria-label="Fechar foto">${icon('close')}</button><img id="preview-photo" alt="Foto selecionada da biblioteca"/><p id="preview-name"></p></dialog>`;
}
