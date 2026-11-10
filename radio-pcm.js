/* Live MP3 -> PCM -> GainNode. Avoids mobile media-element stream bypasses. */
(() => {
  let decoderScript;
  function loadDecoder() {
    if (window['mpg123-decoder']) return Promise.resolve();
    if (!decoderScript) decoderScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('assets/radio/mpg123-decoder.min.js', document.baseURI).href;
      script.charset = 'UTF-8';
      script.onload = resolve;
      script.onerror = () => {decoderScript = null;script.remove();reject(new Error('Radio decoder could not load.'));};
      document.head.append(script);
    });
    return decoderScript;
  }
  class TikpanPCMPlayer {
    constructor(context, output, callbacks) {
      this.context = context;
      this.output = output;
      this.callbacks = callbacks;
      this.controller = new AbortController();
      this.nodes = new Set();
      this.running = true;
      this.nextTime = 0;
      this.hasPlayed = false;
      this.lastData = Date.now();
    }
    async start(url) {
      await loadDecoder();
      if (!this.running) return;
      const library = window['mpg123-decoder'];
      const Decoder = window.Worker ? library.MPEGDecoderWebWorker : library.MPEGDecoder;
      this.decoder = new Decoder({enableGapless:false});
      await this.decoder.ready;
      this.decoderReady = true;
      if (!this.running) {this.freeDecoder();return;}
      const timeout = setTimeout(() => this.controller.abort(), 20000);
      let response;
      try {
        response = await fetch(url, {signal:this.controller.signal, cache:'no-store', credentials:'omit'});
      } finally {clearTimeout(timeout);}
      if (!response.ok || !response.body) throw new Error('The radio stream could not connect.');
      const type = response.headers.get('Content-Type') || '';
      if (/text\/html|application\/json/i.test(type)) {await response.body.cancel();throw new Error('Radio source did not return audio.');}
      this.reader = response.body.getReader();
      this.decodeDeadline = setTimeout(() => {if(this.running && !this.hasPlayed)this.callbacks.onError(new Error('The live MP3 stream could not be decoded.'));}, 15000);
      this.watchdog = setInterval(() => {
        if (this.running && Date.now() - this.lastData > 30000) this.callbacks.onError(new Error('Radio stream timed out.'));
      }, 5000);
      this.read().catch(error => {if (this.running) this.callbacks.onError(error);});
    }
    async waitForSpace(limit = 3) {
      while (this.running && this.nextTime - this.context.currentTime > limit) {
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    }
    async read() {
      while (this.running) {
        await this.waitForSpace();
        if (!this.running) return;
        const {value, done} = await this.reader.read();
        if (done) break;
        this.lastData = Date.now();
        // Bound PCM buffers and keep decoding work away from scroll handlers.
        for (let offset = 0; offset < value.length && this.running; offset += 4096) {
          await this.waitForSpace();
          if (!this.running) return;
          const pcm = await this.decoder.decode(value.subarray(offset, offset + 4096));
          if (!this.running) return;
          if (pcm.samplesDecoded > 0 && pcm.sampleRate > 0) this.schedule(pcm);
        }
      }
      await this.waitForSpace(.05);
      if (this.running) throw new Error('The live stream ended.');
    }
    schedule({channelData, samplesDecoded, sampleRate}) {
      const buffer = this.context.createBuffer(channelData.length, samplesDecoded, sampleRate);
      channelData.forEach((channel, index) => buffer.copyToChannel(channel, index));
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.output);
      this.nodes.add(source);
      const startsAt = Math.max(this.nextTime, this.context.currentTime + .08);
      source.onended = () => {
        this.nodes.delete(source);
        source.disconnect();
        if (this.running && this.nodes.size === 0) this.callbacks.onBuffering();
      };
      source.start(startsAt);
      this.nextTime = startsAt + buffer.duration;
      if (!this.hasPlayed) {
        clearTimeout(this.decodeDeadline);
        this.hasPlayed = true;
        this.playingTimer = setTimeout(() => {if (this.running) this.callbacks.onPlaying();}, Math.max(0, (startsAt - this.context.currentTime) * 1000));
      } else if (this.nodes.size === 1) this.callbacks.onPlaying();
    }
    freeDecoder() {
      if (!this.decoderReady || !this.decoder) return;
      Promise.resolve(this.decoder.free()).catch(() => {});
      this.decoder = null;
    }
    stop() {
      this.running = false;
      this.controller.abort();
      this.reader?.cancel().catch(() => {});
      clearInterval(this.watchdog);
      clearTimeout(this.playingTimer);
      clearTimeout(this.decodeDeadline);
      for (const source of this.nodes) {try {source.stop();} catch {}source.disconnect();}
      this.nodes.clear();
      this.freeDecoder();
    }
  }
  window.TikpanPCMPlayer = TikpanPCMPlayer;
})();
