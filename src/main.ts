import { photoMoment } from './core/photo-windows.js';
import { upgradeAudio } from './storage/audio-upgrade.js';
import { AppUpdates, APP_VERSION } from './media/app-updates.js';
import { createId } from './core/id.js';
import type { Settings, Photo, Transition } from './types.ts';
import { TimerEngine, formatTime } from './core/timer.js';
import { TrainingClock } from './core/clock.js';
import { SignalTracker } from './core/signals.js';
import { WorkoutLock } from './core/session-lock.js';
import { loadSettings, saveSettings, validateSettings } from './storage/settings.js';
import { loadSession, saveSession, clearSession } from './storage/session.js';
import type { SavedSession } from './storage/session.ts';
import { listPhotos } from './storage/photos.js';
import { loadProjectAssets } from './storage/project-assets.js';
import { AudioSystem } from './media/audio.js';
import { ScreenAwake } from './media/wake-lock.js';
import { RestPlaylist } from './media/rest-playlist.js';
import { layout } from './components/layout.js';
import { icon } from './components/icons.js';
import { SettingsPanel } from './components/settings-panel.js';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
$('#app').innerHTML = layout();
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key)
};
const loaded = loadSettings(storage);
let settings = upgradeAudio(loaded.settings,storage);
settings.training.preparation = 3;

settings.appearance = { fight:'#a8ff1a', rest:'#ff343b', preparation:'#f5ff18', scale:100, animations:true };
settings.humor.animations = true; settings.audio.musicCompatibility = true;
const clock = new TrainingClock();
const engine = new TimerEngine(settings.training, clock.now);
const audio = new AudioSystem();
const signals = new SignalTracker();
const workoutLock = new WorkoutLock();
const playlist = new RestPlaylist();
let selectedMode: 'moreira' | 'bjj' | null = null;
let pendingSession: SavedSession | undefined;
let projectPhotos: Photo[] = [];
let photos: Photo[] = [], photoURLs = new Map<string,string>();
let run = '', currentPhoto = '', lastStatus = '';
let tv = false, toastTimeout: ReturnType<typeof setTimeout>;
let updateHold = false;
let updateHoldTimer: ReturnType<typeof setTimeout>;
let isOfflineReady = false, starting = false, lifecycleRecovering = false, saveWarning = false;
let lastSave = -Infinity, clearedRun = '';
let ownershipLost = false, pageSuspended = false, pageReturnPending = false;
const appUpdates = new AppUpdates({isTrainingActive:() => active() || starting,notify});
const awake = new ScreenAwake(message => { $('#wake-status').textContent = message; });
function notify(message: string): void {
  const toast = $('#toast'); toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { toast.hidden = true; }, Math.min(14000, 4000 + message.length * 35));
}
async function confirmAction(message: string): Promise<boolean> {
  const dialog = $<HTMLDialogElement>('#confirm-dialog');
  if (dialog.open) return false;
  $('#confirm-text').textContent = message; dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true }); });
}
$('#confirm-no').addEventListener('click', () => $<HTMLDialogElement>('#confirm-dialog').close('cancel'));
$('#confirm-yes').addEventListener('click', () => $<HTMLDialogElement>('#confirm-dialog').close('yes'));
function active(): boolean { const state = engine.snapshot(); return state.status === 'running' || state.status === 'paused'; }
function effectiveSettings(): Settings {
  const audioOptions = { ...settings.audio, sirens:true, countdown:true, returnCue:true, lastTen:false, funny:false, musicCompatibility:true };
  if (selectedMode === 'bjj') return settings.humor.mode === 'serious' ? { ...settings, audio:audioOptions, humor: { ...settings.humor, mode: 'resenha', phrases:false } } : { ...settings, audio:audioOptions, humor:{ ...settings.humor, phrases:false } };
  return { ...settings, humor: { ...settings.humor, mode: 'serious', animations: false }, audio:audioOptions };
}
function persistWorkout(force = false): void {
  if (!active() || !selectedMode || !workoutLock.owned) return;
  if (!force && clock.now() - lastSave < 1000) return;
  try {
    saveSession(storage, { version: 1, mode: selectedMode, run, savedAt: Date.now(), capture: engine.capture() });
    lastSave = clock.now();
  } catch {
    if (!saveWarning) { saveWarning = true; notify('O timer continua, mas não foi possível salvar o treino. Mantenha esta página aberta.'); }
  }
}
function removeSavedWorkout(): void {
  try { clearSession(storage); } catch { notify('Não foi possível remover o treino salvo. Confira o armazenamento do navegador.'); }
  pendingSession = undefined; $('#restore-banner').hidden = true;
}
function updatePendingSession(): void {
  const saved = loadSession(storage);
  pendingSession = saved.session;
  $('#restore-banner').hidden = !pendingSession;
  if (pendingSession) {
    const s = pendingSession.capture;
    $('#restore-description').textContent = `Modo ${pendingSession.mode === 'moreira' ? 'Moreira' : 'BJJ'} · round ${s.round} de ${s.training.rounds} · ${s.status === 'paused' ? 'pausado' : 'em andamento'}. O tempo decorrido será recalculado ao recuperar.`;
  }
  if (saved.warning) notify(saved.warning);
}
function applySettings(value: Settings): void {
  const normalized = structuredClone(value);
  normalized.appearance = { fight:'#a8ff1a', rest:'#ff343b', preparation:'#f5ff18', scale:100, animations:true };
  normalized.audio.musicCompatibility = true;
  normalized.training.preparation = 3;
  const next = validateSettings(normalized);
  const changedTraining = JSON.stringify(next.training) !== JSON.stringify(settings.training);
  if (changedTraining && active()) throw new Error('Encerre o treino antes de alterar os tempos.');
  try { saveSettings(storage, next); }
  catch { throw new Error('Não foi possível salvar. Verifique espaço e permissões de armazenamento do navegador.'); }
  settings = next;
  if (changedTraining) engine.configure(settings.training);
  playlist.reset(); currentPhoto = '';
  if (!settings.audio.enabled) audio.stop();
  applyAppearance(); render(); persistWorkout(true);
}
function applyAppearance(): void {
  document.documentElement.style.setProperty('--clock-scale', String(settings.appearance.scale / 100));
  document.body.classList.toggle('no-motion', selectedMode === 'moreira' || !settings.appearance.animations);
  document.body.classList.toggle('no-humor-motion', !settings.humor.animations);
  document.body.dataset.appMode = selectedMode || 'selection';
  document.body.dataset.humor = selectedMode === 'bjj' ? 'resenha' : 'serious';
  $('#change-mode').textContent = `MODO ${selectedMode === 'bjj' ? 'BJJ' : 'MOREIRA'}`;
}
function chooseMode(mode: 'moreira' | 'bjj'): void {
  if (active()) return;
  selectedMode = mode;
  $('#mode-screen').hidden = true; $('.app-shell').hidden = false;
  engine.reset(); signals.reset(); playlist.reset();
  if (settings.audio.enabled) void audio.enable().then(() => render());
  updatePendingSession(); applyAppearance(); render(); $('#timer-panel').focus({ preventScroll: true });
}
$('#choose-moreira').addEventListener('click', () => chooseMode('moreira'));
$('#choose-bjj').addEventListener('click', () => chooseMode('bjj'));
$('#change-mode').addEventListener('click', () => {
  if (active()) return;
  selectedMode = null; audio.stop(); $('.app-shell').hidden = true; $('#mode-screen').hidden = false;
  if (tv) toggleTV();
  applyAppearance(); $('#choose-moreira').focus({ preventScroll: true });
});
async function reloadPhotos(): Promise<void> {
  let local: Photo[] = [];
  try { local = await listPhotos(); } catch (error) { notify((error as Error).message); }
  let projectPreferences: Record<string, boolean> = {};
  try { const parsed: unknown = JSON.parse(localStorage.getItem('moreira-bjj:project-photo-preferences:v1') || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) projectPreferences = parsed as Record<string, boolean>; } catch { /* Default: all authorized project photos active. */ }
  const next = [...projectPhotos.map(photo => ({ ...photo, enabled: projectPreferences[photo.id] !== false })), ...local.filter(photo => !photo.id.startsWith('project-'))], nextURLs = new Map<string,string>();
  for (const photo of next) nextURLs.set(photo.id, URL.createObjectURL(photo.blob));
  const previous = photoURLs; photos = next; photoURLs = nextURLs;
  playlist.reset(); currentPhoto = ''; render();
  for (const url of previous.values()) URL.revokeObjectURL(url);
}
function previewPhoto(photo: Photo): void {
  $<HTMLImageElement>('#preview-photo').src = photoURLs.get(photo.id)!;
  $('#preview-name').textContent = photo.name; $<HTMLDialogElement>('#photo-dialog').showModal();
}
$('#close-photo').addEventListener('click', () => $<HTMLDialogElement>('#photo-dialog').close());
let audioTestTimers: ReturnType<typeof setTimeout>[] = [];
function stopAudioTest(): void { audioTestTimers.forEach(clearTimeout); audioTestTimers = []; audio.stop(); }
async function testAudioSequence(): Promise<void> {
  if (engine.snapshot().status === 'running') { notify('Pause o treino para testar o som.'); return; }
  stopAudioTest();
  if (!await audio.recover()) { notify(audio.lastError); return; }
  if (engine.snapshot().status === 'running') return;
  if (!settings.audio.enabled || !settings.audio.volume) { notify('Silencioso selecionado. Escolha Normal ou Academia para testar.'); return; }
  audio.play('test-short', effectiveSettings().audio);
  for (const [delay,cue] of [[1000,'test-short'],[2000,'test-short'],[3000,'test-long']] as const) {
    audioTestTimers.push(setTimeout(() => { if (engine.snapshot().status !== 'running') audio.play(cue, effectiveSettings().audio); },delay));
  }
  render();
}
async function reactivateAudio(): Promise<void> {
  const ready = await audio.recover();
  notify(ready ? settings.audio.enabled ? 'Áudio reativado. Tempo e rounds preservados.' : 'Contexto de áudio reativado. O modo silencioso continua ligado.' : audio.lastError || 'O navegador não reativou o áudio. Confira a saída do Android/Roku.');
  // Never reset/seed the tracker here: a 3–2–1 signal already consumed stays consumed.
  render();
}
const panel = new SettingsPanel({
  mode: () => selectedMode === 'bjj' ? 'bjj' : 'moreira',
  getSettings: () => settings, apply: applySettings, active, photos: () => photos,
  photoURL: id => photoURLs.get(id) || '', reloadPhotos, preview: previewPhoto,
  notify, confirm: confirmAction, testAudio: testAudioSequence
});
$('#open-settings').addEventListener('click', () => { $('#quick-menu').removeAttribute('open'); panel.open(); });
document.querySelectorAll<HTMLButtonElement>('[data-open-tab]').forEach(button => button.addEventListener('click', () => panel.open(button.dataset.openTab)));
$('#audio-reactivate').addEventListener('click', () => { $('#quick-menu').removeAttribute('open'); void reactivateAudio(); });
function processSignals(events: Transition[] = [], silent = false): void {
  const snapshot = engine.snapshot(), effective = effectiveSettings();
  const suppressed = silent || document.hidden || !selectedMode || !workoutLock.owned || !audio.ready || !settings.audio.enabled;
  for (const signal of signals.update(snapshot, events, clock.now(), { silent: suppressed })) audio.play(signal.cue,effective.audio);
  if (events.length) {
    $('#announcer').textContent = snapshot.status === 'finished' ? 'TREINO FINALIZADO.' : snapshot.phase === 'rest' ? `Descanso após o round ${snapshot.round}.` : `Round ${snapshot.round}. Luta!`;
  }
  if ((snapshot.status === 'finished' || snapshot.status === 'ended') && workoutLock.owned) {
    if (clearedRun !== run) { removeSavedWorkout(); clearedRun = run; }
    workoutLock.release();
  }
}
function render(): void {
  const s = engine.snapshot(), effective = effectiveSettings();
  const running = s.status === 'running', paused = s.status === 'paused', inSession = running || paused;
  const done = s.status === 'finished' || s.status === 'ended';
  const phaseName = s.phase === 'fight' ? 'LUTA' : s.phase === 'rest' ? 'DESCANSO' : 'PREPARAÇÃO';
  const phaseLabel = s.status === 'idle' ? 'PRONTO' : s.status === 'finished' ? 'TREINO FINALIZADO' : s.status === 'ended' ? 'TREINO ENCERRADO' : `${paused ? 'PAUSADO · ' : ''}${phaseName}`;
  if ($('#phase-label').dataset.label !== phaseLabel) { $('#phase-label').dataset.label = phaseLabel; $('#phase-label').textContent = phaseLabel; }
  $('#timer-panel').dataset.phase = s.phase;
  $('#timer-panel').classList.toggle('is-paused', paused); $('#timer-panel').classList.toggle('is-finished', done);
  const color = settings.appearance[s.phase]; $('#timer-panel').style.setProperty('--phase-color',color);
  const channels = [1,3,5].map(i => { const n = parseInt(color.slice(i,i+2),16)/255; return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4; });
  $('#timer-panel').classList.toggle('light-phase', channels[0]*.2126+channels[1]*.7152+channels[2]*.0722 > .179);
  $('#clock').textContent = formatTime(s.remaining);
  $('#timer-panel').style.setProperty('--digit-scale',String(5/Math.max(5,formatTime(s.remaining).length)));
  $('#clock').setAttribute('aria-label', `${phaseName}, ${formatTime(s.remaining)} restantes`);
  $('#round-number').innerHTML = `${String(s.round).padStart(2,'0')} <span>/ ${String(s.rounds).padStart(2,'0')}</span>`;
  $('#clock-caption').textContent = done ? 'ATÉ O PRÓXIMO TREINO' : s.phase === 'rest' ? 'PRÓXIMO ROUND EM' : s.phase === 'preparation' ? 'PREPARE-SE' : 'TEMPO DE LUTA';
  $('#clock-note').textContent = s.status === 'idle' ? 'Prepare-se. O próximo round é seu.' : paused ? 'Treino pausado. Continue quando estiver pronto.' : done ? 'Treino feito. Evolução conquistada.' : s.phase === 'rest' ? 'Hidrate. Respire. Prepare o próximo round.' : s.phase === 'preparation' ? 'Posicione-se. O round começa em instantes.' : s.remaining <= 3000 ? '3 · 2 · 1 · ATÉ O SINAL' : 'Presença no tatame. Foco no próximo movimento.';
  const primaryLabel = running ? 'Pausar' : paused ? 'Continuar' : done ? 'Novo treino' : 'Iniciar';
  if ($('#primary').dataset.label !== primaryLabel) { $('#primary').dataset.label = primaryLabel; $('#primary').innerHTML = icon(running ? 'pause' : 'play') + `<span>${primaryLabel}</span>`; }
  $<HTMLButtonElement>('#primary').disabled = starting || updateHold || !!pendingSession || !selectedMode;
  $<HTMLButtonElement>('#update-app').disabled = inSession;
  $('#update-app').title = inSession ? 'Encerre o treino antes de atualizar' : 'Buscar e aplicar atualização';
  $<HTMLButtonElement>('#change-mode').disabled = inSession;
  $<HTMLButtonElement>('#advance').disabled = !inSession;
  $('#advance span').textContent = s.phase === 'rest' ? 'Pular descanso' : s.phase === 'preparation' ? 'Pular preparo' : 'Avançar round';
  $<HTMLButtonElement>('#end').disabled = !inSession;
  $('#phase-progress').style.transform = `scaleX(${done ? 1 : Math.max(0, Math.min(1, s.elapsed / s.duration))})`;
  const moment = photoMoment(s,selectedMode);
  const frame = moment ? playlist.frame(`${run}-${s.phase}-${s.round}-${moment}`,0,effective,photos) : undefined;
  const hasPhoto = !!frame?.photo && photoURLs.has(frame.photo.id);
  $('#resenha-card').hidden = !hasPhoto;
  $('#timer-panel').classList.toggle('with-resenha',hasPhoto);
  $('#photo-wrap').hidden = !hasPhoto;
  if (hasPhoto && frame?.photo && frame.photo.id !== currentPhoto) {
    currentPhoto = frame.photo.id;
    const image = $<HTMLImageElement>('#rest-photo'); image.src = photoURLs.get(currentPhoto)!; image.alt = `Foto da academia: ${frame.photo.name}`;
    $('#resenha-card').classList.remove('new-frame'); void $('#resenha-card').offsetWidth; $('#resenha-card').classList.add('new-frame');
  }
  if (lastStatus !== s.status) { lastStatus = s.status; void awake.set(running); }
  $('#audio-status').textContent = !settings.audio.enabled ? 'Som desativado' : audio.ready ? 'Áudio habilitado' : 'Toque em Reativar áudio';
  $('#recover-lock').hidden = !workoutLock.canRecoverFallback;
  document.title = inSession ? `${formatTime(s.remaining)} · ${phaseName} | Moreira BJJ` : 'MOREIRA BJJ TIMER';
}
async function acquireWorkout(): Promise<boolean> {
  const success = await workoutLock.acquire();
  if (!success) { notify(workoutLock.reason); render(); } else ownershipLost = false;
  return success;
}
$('#primary').addEventListener('click', async () => {
  if (!selectedMode || pendingSession || starting || updateHold) return;
  if (engine.snapshot().status === 'running') {
    processSignals(engine.tick()); engine.pause(); audio.stop(); persistWorkout(true); render(); return;
  }
  stopAudioTest();
  if (settings.audio.enabled) void audio.enable().then(() => render());
  starting = true; render();
  try {
    if (!await acquireWorkout()) return;
    if (engine.snapshot().status === 'paused') engine.resume();
    else { engine.configure({ ...settings.training, preparation:3 }); run = createId(); signals.reset(); playlist.reset(); clock.checkpoint(); engine.start(); }
    processSignals(); persistWorkout(true);
  } catch (error) {
    if (!active()) workoutLock.release();
    notify((error as Error).message || 'Não foi possível iniciar o treino. Tente novamente.');
  } finally { starting = false; render(); }
});
$('#restore-session').addEventListener('click', async () => {
  if (starting || updateHold) return;
  stopAudioTest();
  if (settings.audio.enabled) void audio.enable().then(() => render());
  starting = true; render();
  try {
    if (!await acquireWorkout()) return;
    // Re-read on click so time spent on the selection screen is included.
    const saved = loadSession(storage);
    if (!saved.session) { notify(saved.warning || 'O treino salvo não está mais disponível.'); pendingSession = undefined; $('#restore-banner').hidden = true; workoutLock.release(); return; }
    const session = saved.session; selectedMode = session.mode; run = session.run;
    engine.restore(session.capture,saved.elapsedMs || 0);
    settings = { ...settings, training: { ...session.capture.training } };
    try { saveSettings(storage, settings); } catch { /* Recovery can still work without rewriting preferences. */ }
    signals.reset(); signals.seed(engine.snapshot()); playlist.reset(); pendingSession = undefined; $('#restore-banner').hidden = true;
    clock.checkpoint(); applyAppearance(); processSignals([],true); persistWorkout(true);
    notify('Treino recuperado. Nenhum sinal antigo foi reproduzido.');
  } catch (error) { workoutLock.release(); notify((error as Error).message); }
  finally { starting = false; render(); }
});
$('#discard-session').addEventListener('click', async () => {
  if (!await confirmAction('Descartar o treino salvo? Isso não altera fotos ou configurações.')) return;
  if (!await acquireWorkout()) return;
  removeSavedWorkout(); workoutLock.release(); render();
});
$('#recover-lock').addEventListener('click', async () => {
  if (!await confirmAction('Use somente se todas as outras abas e janelas do timer já foram fechadas. Liberar a reserva antiga?')) return;
  if (await workoutLock.recoverFallback()) { workoutLock.release(); notify('Reserva antiga liberada. Agora você pode iniciar ou recuperar o treino.'); }
  else notify(workoutLock.reason);
  render();
});
$('#reset').addEventListener('click', async () => {
  if (active() && !await confirmAction('Reiniciar desde a preparação e o primeiro round?')) return;
  if (workoutLock.owned) removeSavedWorkout();
  audio.stop(); engine.reset(); signals.reset(); playlist.reset(); workoutLock.release(); render();
});
$('#end').addEventListener('click', async () => {
  if (!active() || !await confirmAction('Encerrar o treino atual?')) return;
  engine.end(); audio.stop(); if (workoutLock.owned) removeSavedWorkout(); workoutLock.release(); render();
});
$('#advance').addEventListener('click', () => { $('#quick-menu').removeAttribute('open'); if (!workoutLock.owned) return; processSignals(engine.advance()); persistWorkout(true); render(); });
function toggleTV(): void {
  tv = !tv; document.body.classList.toggle('tv-mode',tv); $('#tv-toggle').setAttribute('aria-pressed',String(tv));
  $('#tv-toggle').setAttribute('aria-label',tv ? 'Sair do Modo TV' : 'Modo TV');
}
async function fullscreen(): Promise<void> {
  $('#quick-menu').removeAttribute('open');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else notify('Tela cheia não disponível. O Modo TV continua funcionando.');
  } catch { notify('O navegador não permitiu tela cheia. O Modo TV continua funcionando.'); }
}
$('#tv-toggle').addEventListener('click',toggleTV); $('#fullscreen').addEventListener('click',fullscreen);
document.addEventListener('fullscreenchange', () => { $('#fullscreen').setAttribute('aria-label',document.fullscreenElement ? 'Sair da tela cheia' : 'Entrar em tela cheia'); });
$('#help-toggle').addEventListener('click', () => { const help = $('#help'); help.hidden = !help.hidden; $('#help-toggle').setAttribute('aria-expanded',String(!help.hidden)); });
document.addEventListener('keydown', event => {
  if (!selectedMode || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA|BUTTON/.test((event.target as HTMLElement).tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); $('#primary').click(); }
  if (event.key.toLowerCase() === 'f') void fullscreen();
  if (event.key.toLowerCase() === 't') toggleTV();
});
function loseOwnership(): void {
  if (ownershipLost) return; ownershipLost = true;
  engine.pause(); audio.stop(); void awake.set(false);
  notify(workoutLock.reason || 'Outro timer está ativo. Esta sessão foi pausada para evitar sinais duplicados.');
}
function reconcile(): void {
  if (pageSuspended) { void restorePageState(); return; }
  if (lifecycleRecovering) return;
  clock.reconcile();
  if (active() && !workoutLock.owned) { loseOwnership(); render(); return; }
  const events = engine.tick(); processSignals(events,true); signals.seed(engine.snapshot()); render(); persistWorkout(true);
  if (engine.snapshot().status === 'running') void awake.set(true);
  if (settings.audio.enabled && !audio.ready && active()) notify('O treino continua. Toque em Reativar áudio se o sistema suspendeu o som.');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { persistWorkout(true); clock.checkpoint(); stopAudioTest(); }
  else reconcile();
});
async function restorePageState(): Promise<void> {
  if (!pageSuspended || pageReturnPending) return;
  pageReturnPending = true;
  try {
    const success = !active() || await acquireWorkout();
    pageSuspended = false; lifecycleRecovering = false;
    if (success) reconcile(); else { loseOwnership(); render(); }
  } finally { pageReturnPending = false; }
}
window.addEventListener('pagehide', () => {
  persistWorkout(true); clock.checkpoint(); stopAudioTest();
  // Fence immediately: visibility can return before pageshow during bfcache.
  lifecycleRecovering = true; pageSuspended = true; workoutLock.release();
});
window.addEventListener('pageshow', event => { if (event.persisted || pageSuspended) void restorePageState(); });
window.addEventListener('beforeunload', event => { if (active()) { persistWorkout(true); event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('error', () => { if (active()) persistWorkout(true); notify('Ocorreu uma falha na interface. Confira o tempo e use Reativar áudio se necessário.'); });
window.addEventListener('unhandledrejection', () => { if (active()) persistWorkout(true); notify('Uma operação não foi concluída. O tempo do treino não foi reiniciado.'); });
function loop(): void {
  if (!document.hidden && !lifecycleRecovering && selectedMode) {
    if (active() && !workoutLock.owned) loseOwnership();
    else { processSignals(engine.tick()); persistWorkout(); }
    render();
  }
  setTimeout(loop, document.hidden ? 1000 : 50);
}
function connectionStatus(): void {
  const online = navigator.onLine;
  $('#connection').innerHTML = `<i></i>${isOfflineReady ? online ? 'Pronto para offline' : 'Offline · pronto para treinar' : online ? 'Preparando offline…' : 'Offline · cache não confirmado'}`;
  $('#connection').classList.toggle('ready',isOfflineReady);
  $('#gate-status').textContent = $('#connection').textContent;
}
window.addEventListener('online',connectionStatus); window.addEventListener('offline',connectionStatus);
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let installPrompt: InstallPrompt | undefined;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event as InstallPrompt; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => {
  if (!installPrompt) return;
  try { await installPrompt.prompt(); await installPrompt.userChoice; }
  catch { notify('Use o menu do navegador para instalar o aplicativo.'); }
  installPrompt = undefined; $('#install').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#install').hidden = true; notify('Aplicativo instalado. Oss!'); });
async function setupOffline(): Promise<void> {
  if (document.querySelector('meta[name="moreira-development"]')) { $('#connection').textContent = 'Desenvolvimento · sem cache offline'; return; }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    $('#connection').textContent = 'Offline requer HTTPS ou localhost'; return;
  }
  try {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'CACHE_STATUS') { isOfflineReady = event.data.complete === true; connectionStatus(); }
    });
    const registration = await navigator.serviceWorker.register('./sw.js');
    appUpdates.attach(registration);
    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage('CACHE_STATUS');
    navigator.serviceWorker.addEventListener('controllerchange', () => navigator.serviceWorker.controller?.postMessage('CACHE_STATUS'));
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) notify('Atualização pronta. Ela será aplicada quando todas as abas do timer forem fechadas.');
      });
    });
  } catch { $('#connection').textContent = 'Cache offline indisponível'; notify('Não foi possível preparar o modo offline. Verifique espaço e permissões do navegador.'); }
}
$('#app-version').textContent = `Versão ${APP_VERSION}`;
$('#update-app').addEventListener('click', () => { $('#quick-menu').removeAttribute('open'); void appUpdates.check(); });
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data?.type === 'WORKOUT_STATUS_REQUEST') {
    const busy = active() || starting;
    if (!busy) { updateHold = true; clearTimeout(updateHoldTimer); updateHoldTimer = setTimeout(() => { updateHold = false; render(); },5000); render(); }
    event.ports[0]?.postMessage({type:'WORKOUT_STATUS',nonce:event.data.nonce,active:busy});
  }
  if (event.data?.type === 'UPDATE_CHECK_COMPLETE' && !event.data.approved) { clearTimeout(updateHoldTimer); updateHold = false; render(); }
});
navigator.serviceWorker?.addEventListener('controllerchange', () => { clearTimeout(updateHoldTimer); updateHold = false; render(); });
applyAppearance(); render(); connectionStatus(); loop(); void setupOffline();
void loadProjectAssets().then(assets => {
  projectPhotos = assets.photos;
  $('#asset-status').textContent = `${projectPhotos.length} fotos da academia · Modo BJJ`;
  if (assets.logoURL) document.querySelectorAll<HTMLImageElement>('[data-academy-logo]').forEach(image => { image.src = assets.logoURL!; image.hidden = false; });
  return reloadPhotos();
}).catch(error => notify((error as Error).message));
if (loaded.warning) notify(loaded.warning);
