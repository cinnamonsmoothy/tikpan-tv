import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCatalogue, formatDuration, CHANNEL_ID } from './sync-youtube.mjs';

test('formats durations',()=>{assert.equal(formatDuration('PT1H2M3S'),'1:02:03');assert.equal(formatDuration('PT45S'),'0:45');assert.equal(formatDuration('P1DT2H'),'26:00:00');});
test('paginates, deduplicates and excludes unavailable or foreign videos',async()=>{
  let calls=0;
  const request=async(url,options)=>{
    assert.equal(options.headers['X-Goog-Api-Key'],'test-key');
    assert.equal(url.searchParams.has('key'),false);
    calls++;
    const video=(id,channel=CHANNEL_ID,privacy='public')=>({id,snippet:{channelId:channel,title:'A story',publishedAt:'2026-01-01T00:00:00Z',thumbnails:{high:{url:'https://i.ytimg.com/test.jpg'}}},status:{privacyStatus:privacy},contentDetails:{duration:'PT2M3S'},statistics:{viewCount:'123'}});
    let data;
    if(url.pathname.endsWith('/playlistItems')) data=url.searchParams.has('pageToken')?{items:[{contentDetails:{videoId:'aaaaaaaaaaa'}},{contentDetails:{videoId:'ccccccccccc'}}]}:{items:[{contentDetails:{videoId:'aaaaaaaaaaa'}},{contentDetails:{videoId:'bbbbbbbbbbb'}}],nextPageToken:'page-two'};
    else data={items:[video('aaaaaaaaaaa'),video('bbbbbbbbbbb','another-channel'),video('ccccccccccc',CHANNEL_ID,'private')]};
    return {ok:true,json:async()=>data};
  };
  const result=await fetchCatalogue('test-key',request);
  assert.equal(calls,3);assert.equal(result.videos.length,1);assert.equal(result.videos[0].duration,'2:03');assert.equal(result.videos[0].viewCount,123);
});
test('rejects missing keys, API failures and empty catalogues',async()=>{
 await assert.rejects(fetchCatalogue(''),/Missing/);
 await assert.rejects(fetchCatalogue('test',async()=>({ok:false,status:403})),/HTTP 403/);
 await assert.rejects(fetchCatalogue('test',async()=>({ok:true,json:async()=>({items:[]})})),/No public videos/);
});
