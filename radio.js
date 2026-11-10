(() => {
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const radioPanel=$('#radio-panel'), radioTrigger=$('#radio-trigger');
let audio=$('#tikpan-audio');
const radioButton=$('#radio-play'), radioExpand=$('#radio-expand');
const volumeSlider=$('#radio-volume');
let listenerVolume=Number(volumeSlider.value)/100;
let audioContext, gainNode, mediaSource, pcmPlayer;
const AudioContextClass=window.AudioContext || window.webkitAudioContext;
const usePCM=Boolean(AudioContextClass && window.TikpanPCMPlayer && (window.matchMedia('(max-width:700px), (pointer:coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)));
function applyVolume(){
  if(gainNode){
    volumeSlider.hidden=false;
    $('#radio-volume-wrap').firstChild.textContent='Volume ';
    audio.volume=1;
    gainNode.gain.setValueAtTime(listenerVolume,audioContext.currentTime);
  }else{
    audio.volume=listenerVolume;
    // Some mobile browsers reserve native volume for the hardware buttons.
    if(Math.abs(audio.volume-listenerVolume)>.01){
      volumeSlider.hidden=true;
      $('#radio-volume-wrap').firstChild.textContent='Use your phone volume buttons';
    }
  }
}
function prepareAudio(){
  if(!audioContext){
    audioContext=new AudioContextClass();
    gainNode=audioContext.createGain();
    gainNode.connect(audioContext.destination);
  }
  applyVolume();
  return audioContext.resume();
}
function connectAudio(el){
  if(!AudioContextClass){applyVolume();return Promise.resolve();}
  try{
    const ready=prepareAudio();
    mediaSource=audioContext.createMediaElementSource(el);
    mediaSource.connect(gainNode);
    applyVolume();
    // Resume synchronously within the Play gesture, as required by mobile Safari.
    return ready;
  }catch(error){
    if(mediaSource)throw error;
    gainNode=null;
    applyVolume();
    return Promise.resolve();
  }
}
function playbackUI(state, label){
  radioButton.dataset.state=state;
  radioButton.setAttribute('aria-label',label);
  radioButton.title=label;
  $('#radio-dock-status').textContent=state==='connecting'?'Connecting...':state==='playing'?'Playing live':label==='Retry live radio'?'Tap to retry':'Listen live';
}
// Static hosting uses the station directly; data-radio-relay can point to a hosted relay.
const relay = document.getElementById('radio-widget').dataset.radioRelay;
const RADIO_RELAY_URL = relay ? new URL(relay, location.href).href : ''; 
const RADIO_DIRECT_URL = 'https://stream.zeno.fm/v4r3rxspha5vv';
// Every new Play creates a completely new <audio> element and network request.
// This avoids resuming audio decoded/buffered by the previous HTMLMediaElement.
const radioState = {active:false, connecting:false, generation:0, initialised:false};
function radioStatus(message){$('#radio-status').textContent=message;}
function setupRadio(){
  if(radioState.initialised)return;
  radioState.initialised=true;
  audio.preload='none';
  audio.volume=AudioContextClass?1:listenerVolume;
  if(!AudioContextClass)applyVolume();
  radioButton.disabled=false;
  playbackUI('stopped','Play live radio');
  radioStatus('Ready to listen live');

}
function showRadioStopped(message='Paused — press Play to rejoin live'){
  $('.radio-widget').classList.remove('playing');
  playbackUI('stopped', 'Play live radio');
  radioStatus(message);

}
function discardAudio(){
  if(pcmPlayer){pcmPlayer.stop();pcmPlayer=null;}
  const old=audio;
  // Save the listener's volume, but none of the old playback state or buffer.
  if(mediaSource){mediaSource.disconnect();mediaSource=null;}
  old.pause();
  old.removeAttribute('src');
  old.load(); // Aborts the old HTTP response.
  const fresh=document.createElement('audio');
  fresh.id='tikpan-audio';
  fresh.preload='none';
  fresh.volume=gainNode?1:listenerVolume;
  if(AudioContextClass)fresh.crossOrigin='anonymous';
  fresh.setAttribute('playsinline','');
  old.replaceWith(fresh); // Old media element cannot be resumed.
  audio=fresh;
  return fresh;
}
function disconnectRadio(message){
  radioState.generation++;
  radioState.active=false;
  radioState.connecting=false;
  discardAudio();
  showRadioStopped(message);
}
function playbackFailure(generation){
  if(!radioState.active || generation!==radioState.generation)return;
  disconnectRadio('Could not connect to the live broadcast. Please retry.');
  playbackUI('stopped', 'Retry live radio');

}
function showPlaying(generation){
  if(!radioState.active || radioState.generation!==generation)return;
  radioState.connecting=false;
  $('.radio-widget').classList.add('playing');
  playbackUI('playing', 'Pause radio');
  radioStatus('LIVE ? Tikpan Radio');
}
function attachAudioEvents(el,generation){
  el.addEventListener('playing',()=>{if(audio===el)showPlaying(generation)});
  el.addEventListener('waiting',()=>{
    if(radioState.active && audio===el && !el.paused)radioStatus('Buffering live radio…');
  });
  el.addEventListener('error',()=>playbackFailure(generation));
  el.addEventListener('ended',()=>playbackFailure(generation));
}
radioButton.addEventListener('click',async()=>{
  // Another click while connecting cancels the outstanding stream too.
  if(radioState.active){disconnectRadio();return;}
  const generation=radioState.generation+1;
  // Clear any lingering media object before starting a fresh live request.
  const fresh=discardAudio();
  radioState.generation=generation;
  radioState.active=true;
  radioState.connecting=true;
  radioStatus('Connecting to the live broadcast…');
  playbackUI('connecting', 'Stop connecting');
  attachAudioEvents(fresh,generation);
  const streamURL=(RADIO_RELAY_URL || RADIO_DIRECT_URL)+'?live='+Date.now()+'-'+generation;
  try{
    if(usePCM){
      // No HTML media stream is played on mobile: PCM feeds the gain directly.
      const ready=prepareAudio();
      const player=new window.TikpanPCMPlayer(audioContext,gainNode,{
        onPlaying:()=>showPlaying(generation),
        onBuffering:()=>{if(radioState.active && radioState.generation===generation)radioStatus('Buffering live radio...')},
        onError:()=>playbackFailure(generation)
      });
      pcmPlayer=player;
      await ready;
      if(!radioState.active || radioState.generation!==generation)return;
      await player.start(streamURL);
    }else{
      fresh.src=streamURL;
      const ready=connectAudio(fresh);
      const playback=fresh.play();
      await Promise.all([ready,playback]);
    }
  }
  catch(e){playbackFailure(generation);}
  finally{if(radioState.generation===generation)radioState.connecting=false;}
});
function changeVolume(e){listenerVolume=Number(e.target.value)/100;applyVolume();if(audioContext?.state==='suspended')audioContext.resume().catch(()=>{})}
volumeSlider.addEventListener('input',changeVolume);
volumeSlider.addEventListener('change',changeVolume);
function setRadio(open){radioPanel.classList.toggle('open',open);radioTrigger.setAttribute('aria-expanded',String(open));radioTrigger.setAttribute('aria-label',open?'Close live radio player':'Open live radio player');radioPanel.setAttribute('aria-hidden',String(!open));radioPanel.inert=!open;radioExpand.setAttribute('aria-expanded',String(open));radioExpand.setAttribute('aria-label',open?'Collapse radio details':'Expand radio details')}
window.addEventListener('tikpan-menu-open',()=>setRadio(false));
radioTrigger.addEventListener('click',()=>setRadio(!radioPanel.classList.contains('open')));
radioExpand.addEventListener('click',()=>setRadio(!radioPanel.classList.contains('open')));
$('#radio-close').addEventListener('click',()=>{setRadio(false);radioTrigger.focus()});
$$('[data-open-radio]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();setRadio(true);radioButton.focus()}));
window.addEventListener('keydown',e=>{if(e.key==='Escape' && radioPanel.classList.contains('open')){const focused=radioPanel.contains(document.activeElement);setRadio(false);if(focused)radioTrigger.focus()}});

setupRadio();
})();
