import { stripTypeScriptTypes } from 'node:module';
import { readdir, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
async function compile(dir, target) {
  await mkdir(target, { recursive: true });
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const from = path.join(dir, item.name), to = path.join(target, item.name.replace(/\.ts$/, '.js'));
    if (item.isDirectory()) await compile(from, to);
    else if (item.name.endsWith('.ts')) await writeFile(to, stripTypeScriptTypes(await readFile(from, 'utf8'), { mode: 'transform' }));
    else await cp(from, to);
  }
}
await compile(path.join(root, 'src'), path.join(dist, 'src'));
await cp(path.join(root, 'public'), dist, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
const relativeURL = value => value.split(path.sep).map(encodeURIComponent).join('/');
async function assetFiles(directory) {
  try {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await assetFiles(full));
      else if (entry.isFile()) files.push(full);
    }
    return files.sort();
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
// Only explicitly placed athlete photographs become part of the shared library.
// Generic icons, branding and screenshots are never mistaken for athlete photos.
const athletesDirectory = path.join(dist, 'images', 'athletes');
const athleteFiles = (await assetFiles(athletesDirectory)).filter(file => /\.(?:jpe?g|png|webp|avif)$/i.test(file));
const photos = athleteFiles.map(file => {
  const relative = path.relative(dist, file);
  const id = createHash('sha256').update(relative.split(path.sep).join('/')).digest('hex').slice(0, 16);
  return {
    id: `project-athlete-${id}`,
    name: path.basename(file, path.extname(file)).replace(/[_-]+/g, ' '),
    url: relativeURL(relative)
  };
});
await mkdir(athletesDirectory, { recursive: true });
await writeFile(path.join(athletesDirectory, 'catalog.json'), JSON.stringify({ version: 1, photos }, null, 2) + '\n');
const brandingDirectory = path.join(dist, 'images', 'branding');
const brandingFiles = await assetFiles(brandingDirectory);
const preferredLogo = ['.webp', '.png', '.jpg', '.jpeg', '.svg'].map(extension =>
  brandingFiles.find(file => path.dirname(file) === brandingDirectory && path.basename(file).toLowerCase() === `logo${extension}`)
).find(Boolean);
await mkdir(brandingDirectory, { recursive: true });
await writeFile(path.join(brandingDirectory, 'catalog.json'), JSON.stringify({
  version: 1,
  ...(preferredLogo ? { logoURL: relativeURL(path.relative(dist, preferredLogo)) } : {})
}, null, 2) + '\n');
async function list(dir) {
  const result = [];
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) result.push(...await list(full));
    else if (file.name !== 'sw.js') result.push(full);
  }
  return result;
}
const files = (await list(dist)).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 14);
const sw = (await readFile(path.join(root, 'scripts/sw-template.js'), 'utf8'))
  .replace('__VERSION__', version)
  .replace('__ASSETS__', JSON.stringify(['./', ...files.map(f => './' + relativeURL(path.relative(dist, f)))]));
await writeFile(path.join(dist, 'sw.js'), sw);
console.log(`Build pronto: dist/ (${files.length} arquivos, ${photos.length} fotos do projeto, cache ${version}). Sem dependências externas.`);
