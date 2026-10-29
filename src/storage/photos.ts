import { createId } from '../core/id.js';
import type { Photo } from '../types.ts';
const DB = 'moreira-bjj-photos';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Este navegador não oferece armazenamento de fotos.'));
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => { database = undefined; reject(new Error('Não foi possível abrir a biblioteca de fotos. Verifique o armazenamento do navegador.')); };
    request.onblocked = () => { database = undefined; reject(new Error('Feche outras abas do timer e tente novamente.')); };
  });
  return database;
}
export async function listPhotos(): Promise<Photo[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').getAll();
    request.onsuccess = () => resolve((request.result as Photo[]).sort((a,b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(new Error('Não foi possível ler as fotos.'));
  });
}
async function write(action: (store: IDBObjectStore) => void): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    action(tx.objectStore('photos'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'Armazenamento cheio. Exclua algumas fotos e tente novamente.' : 'Não foi possível salvar a alteração das fotos.'));
    tx.onabort = () => reject(new Error('A gravação das fotos foi interrompida. Verifique o espaço disponível.'));
  });
}
export const putPhoto = (photo: Photo): Promise<void> => write(store => { store.put(photo); });
export const deletePhoto = (id: string): Promise<void> => write(store => { store.delete(id); });
export async function importPhoto(file: File): Promise<Photo> {
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name}: limite de 12 MB por foto.`);
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error(`${file.name}: use JPG, PNG, WebP, GIF ou AVIF. Converta HEIC para JPG no celular.`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error(`${file.name}: imagem não suportada ou arquivo corrompido.`); }
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 50000000) throw new Error('A imagem excede 50 megapixels. Reduza a resolução.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Não foi possível preparar a imagem.');
    ctx.fillStyle = '#171b19'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível converter a imagem.')), 'image/jpeg', .85));
    const photo: Photo = { id: createId(), name: file.name.slice(0,120), enabled: true, blob, createdAt: Date.now() };
    await putPhoto(photo); return photo;
  } finally { URL.revokeObjectURL(url); }
}
