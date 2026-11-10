(() => {
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const radioPanel=$('#radio-panel'), radioTrigger=$('#radio-trigger');
let audio=$('#tikpan-audio');
const radioButton=$('#radio-play'), radioExpand=$('#radio-expand');
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
  audio.preload='none';audio.volume=.8;
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
  const old=audio;
  // Save the listener's volume, but none of the old playback state or buffer.
  const volume=Number.isFinite(old.volume)?old.volume:.8;
  old.pause();
  old.removeAttribute('src');
  old.load(); // Aborts the old HTTP response.
  const fresh=document.createElement('audio');
  fresh.id='tikpan-audio';
  fresh.preload='none';
  fresh.volume=volume;
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
function attachAudioEvents(el,generation){
  el.addEventListener('playing',()=>{
    if(!radioState.active || radioState.generation!==generation || audio!==el)return;
    radioState.connecting=false;
    $('.radio-widget').classList.add('playing');
    playbackUI('playing', 'Pause radio');
    radioStatus('LIVE · Tikpan Radio');

    });
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
  fresh.src=(RADIO_RELAY_URL || RADIO_DIRECT_URL)+'?live='+Date.now()+'-'+generation;
  try{await fresh.play();}
  catch(e){playbackFailure(generation);}
  finally{if(radioState.generation===generation)radioState.connecting=false;}
});
$('#radio-volume').addEventListener('input',e=>{audio.volume=Number(e.target.value)/100});
function setRadio(open){radioPanel.classList.toggle('open',open);radioTrigger.setAttribute('aria-expanded',String(open));radioTrigger.setAttribute('aria-label',open?'Close live radio player':'Open live radio player');radioPanel.setAttribute('aria-hidden',String(!open));radioPanel.inert=!open;radioExpand.setAttribute('aria-expanded',String(open));radioExpand.setAttribute('aria-label',open?'Collapse radio details':'Expand radio details')}
radioTrigger.addEventListener('click',()=>setRadio(!radioPanel.classList.contains('open')));
radioExpand.addEventListener('click',()=>setRadio(!radioPanel.classList.contains('open')));
$('#radio-close').addEventListener('click',()=>{setRadio(false);radioTrigger.focus()});
$$('[data-open-radio]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();setRadio(true);radioButton.focus()}));
window.addEventListener('keydown',e=>{if(e.key==='Escape' && radioPanel.classList.contains('open')){const focused=radioPanel.contains(document.activeElement);setRadio(false);if(focused)radioTrigger.focus()}});

setupRadio();
})();
