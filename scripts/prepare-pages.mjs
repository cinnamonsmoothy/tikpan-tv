import { renderFooters } from './render-footer.mjs';
import { cp, mkdir, readdir, rm, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
await renderFooters();
const root = new URL('../', import.meta.url);
const output = new URL('../_site/', import.meta.url);
// Rebuild only the generated _site directory inside this project.
if (fileURLToPath(output).replace(/[\\/]$/, '') !== resolve(fileURLToPath(root), '_site')) throw new Error('Unexpected output directory');
const previous = await lstat(output).catch(error => {if (error.code !== 'ENOENT') throw error;});
if (previous?.isSymbolicLink()) throw new Error('Refusing to replace a symlink output directory');
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
// Publish only public assets. Excludes workflows, old site, server functions and local configuration.
for (const entry of await readdir(root, {withFileTypes:true})) {
  if (entry.isFile() && /\.(html|css|js|json|png|ico|webmanifest|txt)$/.test(entry.name)) {
    await cp(new URL(entry.name, root), new URL(entry.name, output));
  }
}
await cp(new URL('assets/',root), new URL('assets/',output), {
  recursive:true,
  filter: source => {
    const name = source.replaceAll('\\', '/').split('/').pop();
    // Superseded hero footage and Three.js bundles are retained in source only.
    return name !== 'vendor' && !/^hero-video.*\.mp4$/i.test(name);
  }
});
console.log('Prepared public website in _site/.');
