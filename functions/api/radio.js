// Tikpan Radio: same-origin streaming relay. This forwards the live response
// without buffering it, transcoding it, stripping audio, or modifying ad segments.
// The upstream is FIXED to Tikpan's publicly observed Zeno mount point.
const UPSTREAM = 'https://stream.zeno.fm/v4r3rxspha5vv';
export async function onRequestGet({request}) {
  const headers = new Headers({ 'Accept': 'audio/mpeg,audio/aac,audio/*;q=0.9,*/*;q=0.5', 'Cache-Control':'no-store, no-cache, max-age=0', 'Pragma':'no-cache' });
  // Never forward Range headers on a live broadcast: avoid resuming old bytes.
  let source;
  try {
    source = await fetch(UPSTREAM, { method:'GET', headers, redirect:'follow', cache:'no-store' });
  } catch {
    return new Response('The streaming provider could not be reached.', {status:502,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  }
  const type=(source.headers.get('Content-Type')||'').toLowerCase();
  if(!source.ok || !source.body || /text\/html|application\/json/.test(type)){
    try{await source.body?.cancel()}catch{}
    return new Response('The streaming provider did not return audio.', {status:502,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  }
  const responseHeaders=new Headers({
    'Content-Type': type || 'audio/mpeg',
    'Cache-Control': 'no-store, no-cache, must-revalidate, no-transform',
    'Pragma': 'no-cache',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'none'
  });
  // Do not forward upstream tracking cookies or temporary token URLs.
  // If provider sends byte ranges, pass through response status and Content-Range.
  if(source.status===206){
    try{await source.body.cancel()}catch{}
    return new Response('Unexpected ranged stream response; retry live connection.',{status:502,headers:{'Cache-Control':'no-store'}});
  }
  return new Response(source.body,{status:200,headers:responseHeaders});
}
