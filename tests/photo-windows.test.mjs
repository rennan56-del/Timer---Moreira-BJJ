import test from 'node:test';
import assert from 'node:assert/strict';
import { photoMoment } from '../dist/src/core/photo-windows.js';
import { upgradeAudio,AUDIO_UPGRADE_KEY } from '../dist/src/storage/audio-upgrade.js';
import { defaults,SETTINGS_KEY } from '../dist/src/storage/settings.js';
const state=(elapsed,status='running',phase='fight',duration=10000)=>({status,phase,round:1,rounds:5,remaining:duration-elapsed,duration,elapsed,revision:1});
test('BJJ photos appear at first/last3s of fight/rest, not the quiet middle',()=>{
 for(const phase of ['fight','rest']) {
  assert.equal(photoMoment(state(0,'running',phase),'bjj'),'start');
  assert.equal(photoMoment(state(2999,'running',phase),'bjj'),'start');
  assert.equal(photoMoment(state(3000,'running',phase),'bjj'),undefined);
  assert.equal(photoMoment(state(6999,'running',phase),'bjj'),undefined);
  assert.equal(photoMoment(state(7000,'running',phase),'bjj'),'end');
  assert.equal(photoMoment(state(9999,'running',phase),'bjj'),'end');
 }
});
test('preparation, pause, completion and Moreira keep correct photo visibility',()=>{
 assert.equal(photoMoment(state(0,'running','preparation',3000),'bjj'),'end');
 assert.equal(photoMoment(state(8000,'paused'),'bjj'),'end');
 assert.equal(photoMoment(state(10000,'finished'),'bjj'),'final');
 assert.equal(photoMoment(state(0,'idle'),'bjj'),undefined);
 assert.equal(photoMoment(state(0,'ended'),'bjj'),undefined);
 for(const status of ['running','paused','finished']) assert.equal(photoMoment(state(0,status),'moreira'),undefined);
});
test('audio upgrade strengthens old enabled presets once and preserves later Normal choice',()=>{
 const map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
 const original=defaults();original.audio.volume=65;
 const upgraded=upgradeAudio(original,storage);
 assert.equal(upgraded.audio.volume,100);assert.equal(original.audio.volume,65);
 assert.equal(map.get(AUDIO_UPGRADE_KEY),'1');assert.equal(JSON.parse(map.get(SETTINGS_KEY)).audio.volume,100);
 upgraded.audio.volume=65;assert.equal(upgradeAudio(upgraded,storage).audio.volume,65);
 assert.deepEqual(upgraded.training,original.training);
});
test('audio upgrade never unmutes and remains usable with denied storage',()=>{
 for(const configuration of [{enabled:false,volume:65},{enabled:true,volume:0}]){
  const settings=defaults();Object.assign(settings.audio,configuration);
  const output=upgradeAudio(settings,{getItem:()=>null,setItem:()=>{throw new Error('quota')}});
  assert.deepEqual(output.audio,settings.audio);
 }
 const settings=defaults();assert.equal(upgradeAudio(settings,{getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('denied')}}).audio.volume,100);
});
