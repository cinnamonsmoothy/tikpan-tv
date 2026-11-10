import { writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const CHANNEL_ID = 'UCTyRWY6CBW6vaD6YZmfiP1A';
const UPLOADS = 'UUTyRWY6CBW6vaD6YZmfiP1A';

export function formatDuration(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
  if (!match) return '';
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  const h = Number(days) * 24 + Number(hours);
  return h ? `${h}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${Number(minutes)}:${String(seconds).padStart(2, '0')}`;
}

export async function fetchCatalogue(apiKey, request = fetch) {
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY secret.');
  let calls = 0;
  async function api(resource, params) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams(params).toString();
    const response = await request(url, {headers: {'X-Goog-Api-Key': apiKey}, signal: AbortSignal.timeout(20000)});
    calls++;
    if (!response.ok) throw new Error(`YouTube ${resource} failed (HTTP ${response.status}); existing catalogue was not replaced.`);
    return response.json();
  }
  const ids = [];
  const seenTokens = new Set();
  let token = '';
  do {
    if (seenTokens.has(token) || seenTokens.size >= 100) throw new Error('Unexpected uploads pagination; stopping sync.');
    seenTokens.add(token);
    const page = await api('playlistItems', {part:'contentDetails', playlistId:UPLOADS, maxResults:'50', ...(token ? {pageToken:token} : {})});
    if (!Array.isArray(page.items)) throw new Error('Invalid uploads response.');
    for (const item of page.items) {
      const id = item.contentDetails?.videoId;
      if (/^[\w-]{11}$/.test(id || '') && !ids.includes(id)) ids.push(id);
    }
    token = page.nextPageToken || '';
  } while (token);
  const details = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const page = await api('videos', {part:'snippet,contentDetails,statistics,status', id:ids.slice(i,i+50).join(',')});
    if (!Array.isArray(page.items)) throw new Error('Invalid video details response.');
    for (const video of page.items) {
      if (video.snippet?.channelId !== CHANNEL_ID || video.status?.privacyStatus !== 'public') continue;
      if (video.snippet.liveBroadcastContent === 'upcoming') continue;
      const thumbnail = video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url;
      if (!thumbnail || !/^https:\/\//.test(thumbnail)) continue;
      const viewCount = Number(video.statistics?.viewCount || 0);
      details.set(video.id, {id:video.id, title:video.snippet.title, duration:video.snippet.liveBroadcastContent === 'live' ? 'LIVE' : formatDuration(video.contentDetails?.duration), views:`${viewCount.toLocaleString('en-GB')} views`, viewCount, thumbnail, published:video.snippet.publishedAt});
    }
  }
  const videos = ids.map(id => details.get(id)).filter(Boolean).sort((a,b) => Date.parse(b.published) - Date.parse(a.published));
  if (!videos.length) throw new Error('No public videos returned; keeping the previous catalogue.');
  return {videos, calls};
}

export async function syncCatalogue(apiKey, output = new URL('../', import.meta.url)) {
  const {videos, calls} = await fetchCatalogue(apiKey);
  const json = JSON.stringify(videos, null, 2) + '\n';
  const script = '// Synced from Tikpan TV on YouTube. Generated automatically.\nwindow.TIKPAN_VIDEO_CATALOG = ' + JSON.stringify(videos).replaceAll('<', '\\u003c') + ';\n';
  for (const [name, content] of [['videos.json',json], ['video-catalog.js',script]]) {
    const target = new URL(name, output);
    const temp = new URL(name + '.tmp', output);
    await writeFile(temp, content);
    await rename(temp, target);
  }
  console.log(`Synced ${videos.length} public videos using ${calls} YouTube API requests.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncCatalogue(process.env.YOUTUBE_API_KEY).catch(error => {console.error(error.message); process.exitCode = 1;});
}
