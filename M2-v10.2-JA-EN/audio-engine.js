'use strict';
// One signal path for files and synthesis: session gain → volume → analyser → output.
class AMTAudioEngine {
  constructor(assets, notify=()=>{}) {
    this.assets=assets;this.notify=notify;this.cache=new Map();this.serial=0;this.session=null;this.volume=.5;
  }
  async context() {
    if(!this.ctx) {
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();this.master.gain.value=this.volume;
      this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=4096;
      this.master.connect(this.analyser);this.analyser.connect(this.ctx.destination);
    }
    await this.ctx.resume();return this.ctx;
  }
  setVolume(value) {
    this.volume=Math.max(0,Math.min(1,Number(value)||0));
    if(this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.015);
  }
  stop(reason='stopped') {
    this.serial++;const s=this.session;this.session=null;
    if(s) {
      clearInterval(s.timer);cancelAnimationFrame(s.frame);
      if(s.bus) {
        const t=this.ctx.currentTime;s.bus.gain.cancelScheduledValues(t);
        s.bus.gain.setValueAtTime(s.bus.gain.value,t);s.bus.gain.linearRampToValueAtTime(0,t+.015);
        for(const node of s.nodes) { try{node.stop(t+.02);}catch(_){} }
        setTimeout(()=>s.bus.disconnect(),40);
      }
      this.notify({state:reason,key:s.key});
    }
  }
  async start(key,kind,onFrame=()=>{},settings={}) {
    if(this.session?.key===key) {this.stop();return;}
    this.stop();const id=this.serial;
    const s={key,kind,settings,voices:new Map(),nodes:new Set(),frame:0,timer:0};this.session=s;
    this.notify({state:'loading',key});
    try {
      await this.context();if(id!==this.serial)return;
      s.bus=this.ctx.createGain();s.bus.connect(this.master);s.start=this.ctx.currentTime+.04;
      if(kind==='file') {
        const buffer=await this.buffer(key);if(id!==this.serial)return;
        // Decode may take time. Start the audio clock only after it is ready.
        s.start=this.ctx.currentTime+.04;s.duration=buffer.duration;
        const source=this.ctx.createBufferSource();source.buffer=buffer;source.connect(s.bus);s.nodes.add(source);
        source.onended=()=>{source.disconnect();s.nodes.delete(source);if(this.session===s)this.stop('ended');};
        source.start(s.start);
      } else if(kind==='chord') {
        const pitches=settings.ratios,amp=Math.min(.9/pitches.length,.408/Math.sqrt(pitches.length));
        for(const ratio of pitches)this.voice(s,440*2**(-9/12)*ratio,s.start,3,amp,undefined,.16);
        s.duration=3;s.timer=setInterval(()=>{if(this.session===s&&this.ctx.currentTime>=s.start+3.02)this.stop('ended');},40);
      } else if(kind==='drag') {
        s.dragVoice=this.voice(s,440*2**(-9/12)*settings.ratio,s.start,Infinity,.25);
      } else if(kind==='tone') {
        this.voice(s,440*2**(-9/12)*settings.ratio,s.start,1.6,.25,undefined,settings.attack||.02);
        s.duration=1.6;
        s.timer=setInterval(()=>{if(this.session===s&&this.ctx.currentTime>=s.start+s.duration+.02)this.stop('ended');},40);
      } else if(kind==='interval') {
        const C=440*2**(-9/12),f=C*settings.ratio;
        this.voice(s,C,s.start,.65,.25);
        this.voice(s,f,s.start+.8,.9,.25);
        this.voice(s,C,s.start+1.9,1.3,.16);
        this.voice(s,f,s.start+1.9,1.3,.16);
        s.duration=3.2;
        s.timer=setInterval(()=>{if(this.session===s&&this.ctx.currentTime>=s.start+s.duration+.02)this.stop('ended');},40);
      } else if(kind!=='instrument') {
        s.next=0;this.schedule(s);
        s.timer=setInterval(()=>{if(this.session===s)this.schedule(s);},40);
      }
      this.notify({state:'playing',key});
      const data=new Float32Array(this.analyser.fftSize);
      const frame=()=>{
        if(this.session!==s)return;
        this.analyser.getFloatTimeDomainData(data);
        onFrame({time:Math.max(0,this.ctx.currentTime-s.start),data,sampleRate:this.ctx.sampleRate,duration:s.duration});
        s.frame=requestAnimationFrame(frame);
      };frame();
    } catch(error) {if(id===this.serial){this.stop('error');}}
  }
  async buffer(key) {
    if(!this.assets[key])throw Error('Missing audio');
    if(!this.cache.has(key)) {
      const promise=(async()=>{
        const bytes=Uint8Array.from(atob(this.assets[key]),c=>c.charCodeAt(0));
        return this.ctx.decodeAudioData(bytes.buffer);
      })();
      this.cache.set(key,promise);promise.catch(()=>this.cache.delete(key));
    }
    return this.cache.get(key);
  }
  voice(s,f,start,duration,amplitude,sweep,attack=.02) {
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';
    o.frequency.setValueAtTime(f,start);if(sweep)sweep(o.frequency,start);
    g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(amplitude,start+attack);
    if(Number.isFinite(duration)) {
      g.gain.setValueAtTime(amplitude,start+duration-.06);g.gain.linearRampToValueAtTime(0,start+duration);
    }
    o.connect(g);g.connect(s.bus);s.nodes.add(o);
    o.onended=()=>{o.disconnect();g.disconnect();s.nodes.delete(o);};
    o.start(start);if(Number.isFinite(duration))o.stop(start+duration+.01);
    return {o,g,amplitude};
  }
  instrumentNote(id,frequency,sustain=false) {
    const s=this.session;if(s?.kind!=='instrument'||!s.bus)return;
    this.releaseNote(id);
    const v=this.voice(s,frequency,this.ctx.currentTime+.005,sustain?Infinity:.9,id.startsWith('drone')?.1:.24);
    s.voices.set(id,v);this.balanceInstrument(s);
    const previous=v.o.onended;v.o.onended=()=>{previous();if(s.voices.get(id)===v)s.voices.delete(id);if(this.session===s)this.balanceInstrument(s);};
  }
  releaseNote(id) {
    const s=this.session,v=s?.voices?.get(id);if(!v)return;
    const t=this.ctx.currentTime;v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value,t);v.g.gain.linearRampToValueAtTime(0,t+.045);
    try{v.o.stop(t+.05);}catch(_){}s.voices.delete(id);setTimeout(()=>{if(this.session===s)this.balanceInstrument(s);},60);
  }
  balanceInstrument(s) {
    const peak=[...s.voices.values()].reduce((sum,v)=>sum+v.amplitude,0);
    s.bus.gain.setTargetAtTime(Math.min(1,.9/Math.max(.9,peak)),this.ctx.currentTime,.008);
  }
  setDragRatio(ratio) {
    if(this.session?.kind==='drag')this.session.dragVoice?.o.frequency.setTargetAtTime(440*2**(-9/12)*ratio,this.ctx.currentTime,.012);
  }
  schedule(s) {
    const C=440*2**(-9/12),now=this.ctx.currentTime;
    if(s.kind==='odd') {
      const step=AMTAudioEngine.ODD_INTERVAL;
      if(!s.root){this.voice(s,C,s.start,Infinity,.18);s.root=true;}
      // The audio clock determines note starts; UI frame timing never controls pitch.
      while(s.start+s.next*step<now+.15) {
        const n=1+s.next*2,t=s.start+s.next*step;
        if(t>=now-.04)this.voice(s,C*n/2**Math.floor(Math.log2(n)),Math.max(t,now),step-.06,.25);
        s.next++;
      }
    } else if(s.kind==='rise') {
      while(s.start+s.next*16.1<now+.15) {
        const t=s.start+s.next*16.1;
        if(t>=now-.04) {
          this.voice(s,C/2,Math.max(t,now),13.02,.25,(freq,start)=>{
            for(let oct=0;oct<4;oct++){
              freq.setValueAtTime(C/2*2**oct,start+oct*3+1);
              freq.exponentialRampToValueAtTime(C/2*2**(oct+1),start+oct*3+3);
            }
          });
          for(let oct=0;oct<5;oct++)this.voice(s,C/2*2**oct,t+13.3,2.5,.16);
        }
        s.next++;
      }
    }
  }
}
AMTAudioEngine.ODD_INTERVAL=1.4;
if(typeof module!=='undefined')module.exports=AMTAudioEngine;
