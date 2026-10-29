const CACHE = 'moreira-bjj-__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Updates wait for all old clients to close; a running workout is never reloaded.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('moreira-bjj-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) { if (event.request.mode === 'navigate') return cache.match('./index.html'); throw error; }
  }));
});
self.addEventListener('message', event => {
  if (event.data === 'CACHE_STATUS') event.waitUntil(caches.open(CACHE).then(async cache => {
    const complete = (await Promise.all(ASSETS.map(asset => cache.match(asset)))).every(Boolean);
    event.source?.postMessage({ type: 'CACHE_STATUS', complete });
  }));
});

// Optional, user-requested activation. Never infer safety from a single tab:
// all windows in this scope must explicitly report no running/paused workout.
let applyingUpdate;
const UPDATE_LOCK = 'moreira-bjj:active-workout:v1';
function workoutStatus(client,nonce) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    let done = false;
    const finish = active => {
      if (done) return; done = true;
      clearTimeout(timeout); channel.port1.close(); resolve(active);
    };
    const timeout = setTimeout(() => finish(undefined),1500);
    channel.port1.onmessage = event => {
      const data = event.data;
      if (data?.type === 'WORKOUT_STATUS' && data.nonce === nonce && typeof data.active === 'boolean') finish(data.active);
    };
    channel.port1.onmessageerror = () => finish(undefined);
    try { client.postMessage({type:'WORKOUT_STATUS_REQUEST',nonce},[channel.port2]); }
    catch { finish(undefined); }
  });
}
function updateReply(source,requestId,result,reason) {
  try { source?.postMessage({type:'UPDATE_RESULT',requestId,result,reason}); } catch { /* The requester may have closed. */ }
}
async function verifyAndApply(source,requestId) {
  const windows = (await self.clients.matchAll({type:'window',includeUncontrolled:true}))
    .filter(client => client.url.startsWith(self.registration.scope));
  const nonce = `check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let approved = false;
  try {
    const states = await Promise.all(windows.map(client => workoutStatus(client,nonce)));
    if (!windows.length || states.some(active => active !== false)) {
      updateReply(source,requestId,'blocked','Atualização adiada. Há treino ativo ou uma aba não confirmou o estado. Finalize o treino e feche outras abas do timer.');
      return;
    }
    approved = true;
    updateReply(source,requestId,'approved');
    await self.skipWaiting();
  } finally {
    for (const client of windows) {
      try { client.postMessage({type:'UPDATE_CHECK_COMPLETE',nonce,approved}); } catch { /* Closed client. */ }
    }
  }
}
async function guardedUpdate(source,requestId) {
  try {
    const locks = self.navigator?.locks;
    if (locks?.request) {
      await locks.request(UPDATE_LOCK,{mode:'exclusive',ifAvailable:true},async lock => {
        if (!lock) { updateReply(source,requestId,'blocked','Há um treino em andamento em outra aba. Finalize-o antes de atualizar.'); return; }
        await verifyAndApply(source,requestId);
      });
    } else await verifyAndApply(source,requestId);
  } catch { updateReply(source,requestId,'error','Não foi possível confirmar a atualização. Feche outras abas após finalizar os treinos e tente novamente.'); }
}
self.addEventListener('message',event => {
  if (event.data?.type !== 'APPLY_UPDATE' || typeof event.data.requestId !== 'string' || event.data.requestId.length > 150) return;
  if (applyingUpdate) { updateReply(event.source,event.data.requestId,'blocked','Outra verificação de atualização está em andamento. Aguarde e tente novamente.'); return; }
  const pending = guardedUpdate(event.source,event.data.requestId);
  applyingUpdate = pending;
  event.waitUntil(pending.finally(() => { if (applyingUpdate === pending) applyingUpdate = undefined; }));
});
