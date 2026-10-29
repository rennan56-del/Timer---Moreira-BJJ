import { WheelPicker, wheelMarkup } from './wheel-picker.js';
import type { Settings, Photo } from '../types.ts';
import { icon, escapeHTML as esc } from './icons.js';
import { defaults, validateSettings } from '../storage/settings.js';
import { importPhoto, putPhoto, deletePhoto } from '../storage/photos.js';
type Context = {
  mode(): 'moreira' | 'bjj'; getSettings(): Settings; apply(value: Settings): void; active(): boolean;
  photos(): Photo[]; photoURL(id: string): string; reloadPhotos(): Promise<void>;
  preview(photo: Photo): void; notify(message: string): void;
  confirm(message: string): Promise<boolean>; testAudio(): Promise<void>;
};
type AudioPreset = 'normal' | 'gym' | 'silent';
export class SettingsPanel {
  private tab = 'training';
  private draft?: Settings;
  private editing?: 'fight' | 'rest';
  private wheels: WheelPicker[] = [];
  private dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  private body = document.querySelector<HTMLDivElement>('#settings-body')!;
  constructor(private ctx: Context) {
    this.dialog.addEventListener('close', () => { if (this.dialog.open) return; this.disposeWheels(); this.draft = undefined; this.editing = undefined; this.dialog.classList.remove('editing-time'); });
    this.dialog.addEventListener('cancel', event => { if (this.editing) { event.preventDefault(); this.render('training'); } });
    document.querySelector('#close-settings')!.addEventListener('click', () => this.dialog.close());
    // Older cached layouts may still contain tabs. Their routes are normalized
    // below; the primary panel remains limited to training and sound presets.
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => this.render(button.dataset.tab!)));
  }
  open(tab = 'training'): void {
    this.disposeWheels(); this.body.replaceChildren();
    this.draft = structuredClone(this.ctx.getSettings());
    if (!this.dialog.open) this.dialog.showModal();
    this.render(tab);
  }
  private audioPreset(settings: Settings): AudioPreset {
    if (!settings.audio.enabled || settings.audio.volume === 0) return 'silent';
    return settings.audio.volume >= 85 ? 'gym' : 'normal';
  }
  private applyAudioPreset(settings: Settings, value: FormDataEntryValue | null): void {
    if (!['normal','gym','silent'].includes(String(value))) throw new Error('Escolha uma opção de som.');
    const preset = value as AudioPreset;
    settings.audio = { ...settings.audio, enabled: preset !== 'silent', volume: preset === 'gym' ? 100 : preset === 'silent' ? 0 : 65, musicCompatibility: true };
  }
  private bindSecondaryNavigation(): void {
    this.body.querySelector('#settings-back')?.addEventListener('click', () => this.render('training'));
    this.body.querySelector('#open-library')?.addEventListener('click', () => this.render('humor'));
    this.body.querySelector('#open-data')?.addEventListener('click', () => this.render('data'));
  }
  private disposeWheels(): void { this.wheels.forEach(wheel => wheel.dispose()); this.wheels = []; }
  private captureDraft(): void {
    const form = this.body.querySelector<HTMLFormElement>('#settings-form');
    if (!form || !this.draft) return;
    this.wheels.forEach(wheel => wheel.flush());
    const data = new FormData(form);
    if (!this.ctx.active()) this.draft.training.rounds = Number(data.get('rounds'));
    this.applyAudioPreset(this.draft,data.get('audioPreset'));
  }
  private editTime(kind: 'fight' | 'rest'): void {
    if (this.ctx.active()) return;
    this.captureDraft(); this.disposeWheels(); this.editing = kind;
    const seconds = this.draft!.training[kind];
    this.dialog.classList.add('editing-time'); this.dialog.setAttribute('aria-labelledby','time-editor-title'); this.dialog.scrollTop = 0;
    this.body.innerHTML = `<section class="time-editor" aria-labelledby="time-editor-title"><header class="time-editor-heading"><button type="button" id="time-back" class="button ghost">Voltar</button><h2 id="time-editor-title">${kind === 'fight' ? 'LUTA' : 'DESCANSO'}</h2><button type="button" id="time-done" class="button ghost">CONCLUÍDO</button></header><div class="time-editor-wheels">${wheelMarkup(kind+'Minutes','Minutos',Math.floor(seconds/60),0,1440,5)}${wheelMarkup(kind+'Seconds','Segundos',seconds%60,0,59,5)}</div><p id="time-error" role="alert"></p></section>`;
    this.wheels = Array.from(this.body.querySelectorAll<HTMLElement>('.wheel-picker')).map(element => new WheelPicker(element));
    this.body.querySelector('#time-back')!.addEventListener('click', () => this.render('training'));
    this.body.querySelector('#time-done')!.addEventListener('click', () => {
      this.wheels.forEach(wheel => wheel.flush());
      const get = (unit: string) => Number(this.body.querySelector<HTMLInputElement>(`[name="${kind}${unit}"]`)!.value);
      const value = get('Minutes')*60+get('Seconds');
      if (value < (kind === 'fight' ? 1 : 0) || value > 86400) {
        this.body.querySelector('#time-error')!.textContent = kind === 'fight' ? 'Escolha de 1 segundo a 24 horas de luta.' : 'Escolha de zero a 24 horas de descanso.'; return;
      }
      this.draft!.training[kind] = value; this.render('training');
      this.body.querySelector<HTMLElement>(`#edit-${kind}`)!.focus({preventScroll:true});
    });
    this.body.querySelector<HTMLElement>('.wheel-picker')!.focus({preventScroll:true});
  }
  render(tab = this.tab): void {
    this.captureDraft(); this.disposeWheels(); this.editing = undefined; this.dialog.classList.remove('editing-time'); this.dialog.setAttribute('aria-labelledby','settings-title');
    tab = tab === 'humor' && this.ctx.mode() === 'bjj' ? 'humor' : tab === 'data' ? 'data' : 'training';
    this.tab = tab;
    const navigation = this.dialog.querySelector<HTMLElement>('.settings-tabs');
    if (navigation) navigation.hidden = true;
    const s = this.draft ||= structuredClone(this.ctx.getSettings());
    const back = `<button type="button" id="settings-back" class="button secondary">Voltar ao treino</button>`;
    if (tab === 'data') {
      this.body.innerHTML = `${back}<section class="library-section"><h3>Fotos e dados</h3><p class="muted">Configurações ficam neste dispositivo.</p><div class="data-actions"><button type="button" id="export-settings" class="button secondary">${icon('download')} Exportar configurações</button><label class="button secondary file-label">Importar configurações<input id="import-settings" type="file" accept="application/json,.json"/></label><button type="button" id="persist-storage" class="button secondary">${icon('shield')} Solicitar armazenamento persistente</button><button type="button" id="restore-settings" class="button danger">Restaurar padrões</button></div><p class="hint">A exportação não inclui fotos. Guarde os originais. Limpar os dados do navegador ou trocar de dispositivo pode apagar a biblioteca.</p></section>`;
      this.bindSecondaryNavigation(); this.bindData(); return;
    }
    if (tab === 'humor') {
      this.body.innerHTML = `${back}<section class="library-section"><h3>Fotos da academia</h3><p class="muted">5 fotos incluídas no aplicativo. Fotos adicionadas aqui ficam somente neste dispositivo.</p></section><section class="library-section" id="photos-library"></section>`;
      this.bindSecondaryNavigation(); this.renderPhotos(); return;
    }
    const duration = (name: string, title: string, seconds: number) => `<button type="button" id="edit-${name}" class="duration-choice" aria-label="Editar ${title}" aria-haspopup="dialog"><span>${title}</span><strong>${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}</strong><span aria-hidden="true">›</span></button>`;
    const preset = this.audioPreset(s);
    this.body.innerHTML = `<form id="settings-form"><h3>Configure o treino</h3>${this.ctx.active() ? '<p class="notice">Encerre o treino para alterar os tempos. O som pode ser ajustado agora.</p>' : ''}<fieldset class="training-fields" ${this.ctx.active() ? 'disabled' : ''}><div class="form-grid">${duration('fight','LUTA',s.training.fight)}${duration('rest','DESCANSO',s.training.rest)}${wheelMarkup('rounds','Quantidade de rounds',s.training.rounds,1,999)}</div></fieldset><label>Som<select name="audioPreset"><option value="normal" ${preset === 'normal' ? 'selected' : ''}>Normal</option><option value="gym" ${preset === 'gym' ? 'selected' : ''}>Academia</option><option value="silent" ${preset === 'silent' ? 'selected' : ''}>Silencioso</option></select></label><button type="button" id="test-audio" class="button secondary">${icon('sound')} Testar Som</button><p class="hint">Preparação automática de 3 segundos. Sem descanso após o último round.</p><p id="settings-feedback" role="status" aria-live="polite"></p><div class="form-save"><button class="button primary" type="submit">${icon('check')} Salvar configurações</button></div></form><details id="library-data" class="library-section"><summary>Fotos e dados</summary><div class="data-actions">${this.ctx.mode() === 'bjj' ? `<button type="button" id="open-library" class="button secondary">${icon('photo')} Fotos da academia</button>` : ''}<button type="button" id="open-data" class="button secondary">${icon('download')} Importar e exportar dados</button></div></details>`;
    this.wheels = Array.from(this.body.querySelectorAll<HTMLElement>('.wheel-picker')).map(element => new WheelPicker(element));
    if (this.ctx.active()) this.body.querySelectorAll<HTMLElement>('.wheel-picker').forEach(element => { element.tabIndex = -1; element.setAttribute('aria-disabled','true'); });
    this.body.querySelector('#edit-fight')!.addEventListener('click', () => this.editTime('fight'));
    this.body.querySelector('#edit-rest')!.addEventListener('click', () => this.editTime('rest'));
    const feedback = this.body.querySelector<HTMLElement>('#settings-feedback')!;
    const form = this.body.querySelector<HTMLFormElement>('#settings-form')!;
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        this.captureDraft();
        const next = structuredClone(this.ctx.getSettings());
        if (!this.ctx.active()) next.training = { ...this.draft!.training, preparation:3 };
        next.audio = { ...this.draft!.audio };
        this.ctx.apply(validateSettings(next)); this.ctx.notify('Configurações salvas.'); this.dialog.close();
      } catch (error) { feedback.textContent = (error as Error).message; this.ctx.notify((error as Error).message); }
    });
    this.body.querySelector('#test-audio')!.addEventListener('click', async () => {
      try {
        this.captureDraft();
        const next = structuredClone(this.ctx.getSettings());
        next.audio = { ...this.draft!.audio };
        this.ctx.apply(validateSettings(next));
        await this.ctx.testAudio();
      } catch (error) { this.ctx.notify((error as Error).message); }
    });
    this.bindSecondaryNavigation();
  }
  private renderPhotos(): void {
    const target = this.body.querySelector('#photos-library')!;
    const photos = this.ctx.photos();
    target.innerHTML = `<div class="library-title"><div><h3>Fotos da academia</h3><p class="muted">${photos.filter(p => p.enabled).length} ativas · ${photos.length} fotos disponíveis</p></div><label class="button secondary file-label">${icon('plus')} Adicionar fotos<input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple/></label></div><p class="hint">As 5 fotos incluídas são distribuídas com o aplicativo e podem ser desativadas neste dispositivo. Seus novos uploads ficam somente no navegador: até 12 MB por arquivo, reduzidos para 1.600 px e sem metadados; GIF é salvo como foto.</p><div class="photo-grid">${photos.length ? photos.map(photo => `<article class="photo-item ${photo.enabled ? '' : 'disabled'}"><button class="photo-preview" data-preview="${esc(photo.id)}" aria-label="Visualizar ${esc(photo.name)}"><img src="${esc(this.ctx.photoURL(photo.id))}" alt="${esc(photo.name)}" loading="lazy"/></button><span class="photo-name" title="${esc(photo.name)}">${esc(photo.name)}</span>${photo.id.startsWith('project-') ? '<span class="photo-name">Incluída no aplicativo</span>' : ''}<div class="photo-actions"><button data-toggle-photo="${esc(photo.id)}" aria-pressed="${photo.enabled}" class="small-button">${photo.enabled ? '✓ Ativa' : 'Inativa'}</button>${photo.id.startsWith('project-') ? '' : `<button data-delete-photo="${esc(photo.id)}" class="small-button danger" aria-label="Excluir ${esc(photo.name)}">${icon('trash')}</button>`}</div></article>`).join('') : `<div class="empty-library">${icon('photo')}<strong>Suas fotos aparecem aqui.</strong><span>Adicione fotos pelo celular ou computador.</span></div>`}</div>`;
    target.querySelector<HTMLInputElement>('#photo-upload')!.addEventListener('change', async event => {
      const input = event.target as HTMLInputElement, files = Array.from(input.files || []);
      input.disabled = true;
      let count = 0; const errors: string[] = [];
      for (const file of files) { try { await importPhoto(file); count++; } catch (e) { errors.push((e as Error).message); } }
      try { await this.ctx.reloadPhotos(); } catch (e) { errors.push((e as Error).message); }
      if (this.tab === 'humor') this.renderPhotos();
      this.ctx.notify(`${count} foto(s) adicionada(s). ${errors.join(' ')}`);
    });
    target.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(button => button.addEventListener('click', () => {
      const photo = photos.find(p => p.id === button.dataset.preview); if (photo) this.ctx.preview(photo);
    }));
    target.querySelectorAll<HTMLButtonElement>('[data-toggle-photo]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const photo = photos.find(p => p.id === button.dataset.togglePhoto)!;
        if (photo.id.startsWith('project-')) {
          const key = 'moreira-bjj:project-photo-preferences:v1';
          const preferences: Record<string, boolean> = {};
          try {
            const saved: unknown = JSON.parse(localStorage.getItem(key) || '{}');
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
              for (const [id, enabled] of Object.entries(saved)) if (id.startsWith('project-') && typeof enabled === 'boolean') preferences[id] = enabled;
            }
          } catch { /* A malformed preference record can be rebuilt safely. */ }
          preferences[photo.id] = !photo.enabled;
          localStorage.setItem(key, JSON.stringify(preferences));
        } else await putPhoto({ ...photo, enabled: !photo.enabled });
        await this.ctx.reloadPhotos(); if (this.tab === 'humor') this.renderPhotos();
      }
      catch (e) { button.disabled = false; this.ctx.notify((e as Error).message); }
    }));
    target.querySelectorAll<HTMLButtonElement>('[data-delete-photo]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.deletePhoto?.startsWith('project-')) { this.ctx.notify('Esta foto está incluída no aplicativo. Você pode desativá-la neste dispositivo.'); return; }
      if (!await this.ctx.confirm('Excluir esta foto da biblioteca deste dispositivo?')) return;
      try { await deletePhoto(button.dataset.deletePhoto!); await this.ctx.reloadPhotos(); if (this.tab === 'humor') this.renderPhotos(); }
      catch (e) { this.ctx.notify((e as Error).message); }
    }));
  }
  private bindData(): void {
    this.body.querySelector('#export-settings')!.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(this.ctx.getSettings(), null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'moreira-bjj-configuracoes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    this.body.querySelector<HTMLInputElement>('#import-settings')!.addEventListener('change', async event => {
      const input = event.target as HTMLInputElement, file = input.files?.[0];
      if (!file) return;
      try {
        if (this.ctx.active()) throw new Error('Encerre o treino antes de importar configurações.');
        if (file.size > 2 * 1024 * 1024) throw new Error('Arquivo muito grande. Limite: 2 MB.');
        const next = validateSettings(JSON.parse(await file.text()));
        if (!await this.ctx.confirm('Substituir configurações pelo arquivo selecionado? As fotos serão mantidas.')) return;
        this.ctx.apply(next); this.draft = structuredClone(this.ctx.getSettings()); this.ctx.notify('Configurações importadas.');
      } catch (e) { this.ctx.notify((e as Error).message); }
      finally { input.value = ''; }
    });
    this.body.querySelector('#restore-settings')!.addEventListener('click', async () => {
      if (this.ctx.active()) { this.ctx.notify('Encerre o treino antes de restaurar os padrões.'); return; }
      if (!await this.ctx.confirm('Restaurar configurações iniciais? As fotos serão mantidas.')) return;
      try { const next = defaults(); next.phrases = structuredClone(this.ctx.getSettings().phrases); next.humor.phrases = this.ctx.getSettings().humor.phrases; this.ctx.apply(next); this.draft = structuredClone(this.ctx.getSettings()); this.ctx.notify('Padrões restaurados. Fotos mantidas.'); }
      catch (e) { this.ctx.notify((e as Error).message); }
    });
    this.body.querySelector('#persist-storage')!.addEventListener('click', async () => {
      try {
        if (!navigator.storage?.persist) throw new Error('Este navegador não oferece essa opção. Guarde os originais das fotos.');
        const granted = await navigator.storage.persist();
        this.ctx.notify(granted ? 'Armazenamento persistente concedido pelo navegador.' : 'O navegador não concedeu persistência. Guarde os originais das fotos.');
      } catch (e) { this.ctx.notify((e as Error).message); }
    });
  }
}
