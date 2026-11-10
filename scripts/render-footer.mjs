import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function renderFooters() {
  const root = new URL('../', import.meta.url);
  const template = await readFile(new URL('components/site-footer.html', root), 'utf8');
  for (const page of ['index.html', 'about.html']) {
    const home = page === 'index.html';
    const links = {HOME_URL:home ? '#top' : 'index.html#top', ABOUT_URL:home ? 'about.html#top' : '#top', RADIO_URL:home ? '#radio' : 'index.html#radio'};
    const footer = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in links)) throw new Error(`Unknown footer variable ${key}`);
      return links[key];
    });
    const path = new URL(page, root);
    const html = await readFile(path, 'utf8');
    const pattern = /<footer class="site-footer"[^>]*>[\s\S]*?<\/footer>/g;
    if ([...html.matchAll(pattern)].length !== 1) throw new Error(`Expected one site footer in ${page}`);
    await writeFile(path, html.replace(pattern, footer));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await renderFooters();
