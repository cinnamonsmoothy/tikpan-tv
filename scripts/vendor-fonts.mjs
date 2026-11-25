import { mkdir, writeFile } from 'node:fs/promises';

// Run manually to refresh the same families and weights used by the design.
const root = new URL('../assets/fonts/', import.meta.url);
await mkdir(root, { recursive: true });
const source = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400..700&family=Manrope:wght@400..800&display=swap';
const response = await fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } });
if (!response.ok) throw new Error(`Font stylesheet: HTTP ${response.status}`);
let css = await response.text();
const files = [...new Set([...css.matchAll(/https:\/\/fonts\.gstatic\.com\/[^)\s]+\.woff2/g)].map(match => match[0]))];
if (files.length < 3 || /\.ttf/.test(css)) throw new Error('Expected WOFF2 font subsets');
await Promise.all(files.map(async url => {
  const font = await fetch(url);
  if (!font.ok) throw new Error(`Font download: HTTP ${font.status}`);
  await writeFile(new URL(url.split('/').pop(), root), Buffer.from(await font.arrayBuffer()));
}));
for (const url of files) css = css.replaceAll(url, url.split('/').pop());
await writeFile(new URL('fonts.css', root), `/* Self-hosted Google Fonts; see OFL license files in this directory. */\n${css}`);
for (const family of ['barlowcondensed', 'dmsans', 'manrope']) {
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);
  if (!license.ok) throw new Error(`Missing ${family} font license`);
  await writeFile(new URL(`${family}-OFL.txt`, root), await license.text());
}
console.log(`Vendored ${files.length} WOFF2 subsets with their licenses.`);
