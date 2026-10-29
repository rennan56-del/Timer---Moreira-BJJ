import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
const project = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(project,'src/storage/project-assets.ts'),'utf8');
const moduleText = stripTypeScriptTypes(source,{mode:'transform'});
const { loadProjectAssets } = await import('data:text/javascript,'+encodeURIComponent(moduleText));

test('build cataloga somente atletas, identifica logo e inclui assets no cache offline', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(),'moreira-assets-'));
  try {
    for (const directory of ['scripts','src','public/images/athletes/equipe','public/images/branding','public/images/other']) await mkdir(path.join(temporary,directory),{recursive:true});
    await cp(path.join(project,'scripts/build.mjs'),path.join(temporary,'scripts/build.mjs'));
    await cp(path.join(project,'scripts/sw-template.js'),path.join(temporary,'scripts/sw-template.js'));
    await writeFile(path.join(temporary,'index.html'),'<!doctype html><title>asset fixture</title>');
    const fixture = await readFile(path.join(project,'public/icons/icon-192.png'));
    await writeFile(path.join(temporary,'public/images/athletes/atleta-01.png'),fixture);
    await writeFile(path.join(temporary,'public/images/athletes/equipe/Foto #2.JPG'),fixture);
    await writeFile(path.join(temporary,'public/images/athletes/README.md'),'not a photograph');
    await writeFile(path.join(temporary,'public/images/athletes/unsupported.gif'),fixture);
    await writeFile(path.join(temporary,'public/images/other/reference.png'),fixture);
    await writeFile(path.join(temporary,'public/images/branding/logo.png'),fixture);
    const build = spawnSync(process.execPath,[path.join(temporary,'scripts/build.mjs')],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr);
    const catalog = JSON.parse(await readFile(path.join(temporary,'dist/images/athletes/catalog.json'),'utf8'));
    assert.equal(catalog.photos.length,2);
    assert.ok(catalog.photos.every(photo=>/^project-athlete-[0-9a-f]{16}$/.test(photo.id)));
    assert.ok(catalog.photos.some(photo=>photo.url==='images/athletes/equipe/Foto%20%232.JPG'));
    const branding = JSON.parse(await readFile(path.join(temporary,'dist/images/branding/catalog.json'),'utf8'));
    assert.equal(branding.logoURL,'images/branding/logo.png');
    const sw = await readFile(path.join(temporary,'dist/sw.js'),'utf8');
    assert.ok(sw.includes('./images/athletes/atleta-01.png'));
    assert.ok(sw.includes('./images/athletes/equipe/Foto%20%232.JPG'));
    assert.ok(sw.includes('./images/branding/logo.png'));
    const ids=catalog.photos.map(photo=>photo.id);
    const repeat = spawnSync(process.execPath,[path.join(temporary,'scripts/build.mjs')],{encoding:'utf8'});
    assert.equal(repeat.status,0,repeat.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(temporary,'dist/images/athletes/catalog.json'),'utf8')).photos.map(photo=>photo.id),ids);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});

test('loader usa a base da PWA, carrega fotos fixas e ignora URLs externas/duplicadas', async()=>{
  const requests=[];
  const request=async input=>{
    const url=String(input); requests.push(url);
    if (url.endsWith('/athletes/catalog.json')) return Response.json({version:1,photos:[
      {id:'project-athlete-a',name:'Atleta A',url:'images/athletes/a.webp'},
      {id:'project-athlete-a',name:'Duplicada',url:'images/athletes/duplicate.webp'},
      {id:'project-athlete-b',name:'Externa',url:'https://evil.test/images/athletes/a.webp'},
      {id:'project-athlete-c',name:'Escape',url:'images/athletes/../../../outside.jpg'},
      {id:'project-athlete-d',name:'Busca',url:'images/athletes/a.webp?external=1'}
    ]});
    if (url.endsWith('/branding/catalog.json')) return Response.json({version:1,logoURL:'images/branding/logo.webp'});
    if (url.endsWith('/athletes/a.webp')) return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'application/octet-stream'}});
    throw new Error('Unexpected request '+url);
  };
  const assets=await loadProjectAssets('https://example.test/academia/timer/index.html',request);
  assert.equal(assets.photos.length,1); assert.equal(assets.photos[0].id,'project-athlete-a');
  assert.equal(assets.photos[0].enabled,true); assert.equal(assets.photos[0].blob.type,'image/webp');
  assert.equal(assets.logoURL,'https://example.test/academia/timer/images/branding/logo.webp');
  assert.equal(requests.length,3); assert.ok(requests.every(url=>url.startsWith('https://example.test/academia/timer/')));
});

test('loader tolera catálogo ausente, offline sem cache e foto individual inválida', async()=>{
  assert.deepEqual(await loadProjectAssets('https://example.test/app/',async()=>new Response('',{status:404})),{photos:[]});
  assert.deepEqual(await loadProjectAssets('https://example.test/app/',async()=>{throw new Error('offline')}),{photos:[]});
  assert.deepEqual(await loadProjectAssets('file:///app/index.html',async()=>{throw new Error('should not fetch')}),{photos:[]});
  const result=await loadProjectAssets('https://example.test/app/',async input=>{
    const url=String(input);
    if(url.endsWith('/athletes/catalog.json')) return Response.json({version:1,photos:[{id:'project-athlete-a',url:'images/athletes/missing.png'}]});
    if(url.endsWith('/branding/catalog.json')) return Response.json({version:1,logoURL:'https://outside.test/logo.svg'});
    return new Response('',{status:404});
  });
  assert.deepEqual(result,{photos:[]});
});
