import { cp, mkdir, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('../_site/', import.meta.url);
await mkdir(output, {recursive:true});
// Publish only public assets. Excludes workflows, old site, server functions and local configuration.
for (const entry of await readdir(root, {withFileTypes:true})) {
  if (entry.isFile() && /\.(html|css|js|json|png|ico|webmanifest|txt)$/.test(entry.name)) {
    await cp(new URL(entry.name, root), new URL(entry.name, output));
  }
}
await cp(new URL('assets/',root), new URL('assets/',output), {recursive:true});
console.log('Prepared public website in _site/.');
