/* Browser/worker/Node shared numerical engine. No precomputed spectra. */
(function(root){
  'use strict';
  function createEngine(){
    const C0=440*Math.pow(2,-57/12), LIMIT=C0*1024, N=32;
    const W=Array.from({length:N-1},(_,i)=>1/(i+2)**2).reduce((a,b)=>a+b,0);
    function wav(buffer){
      const d=new DataView(buffer), tag=i=>String.fromCharCode(...new Uint8Array(buffer,i,4));
      if(tag(0)!=='RIFF'||tag(8)!=='WAVE')throw Error('RIFF/WAVE形式ではありません');
      let fmt,offset,size;
      for(let i=12;i+8<=d.byteLength;){const n=d.getUint32(i+4,true);if(i+8+n>d.byteLength)throw Error('WAVが途中で切れています');
        if(tag(i)==='fmt ')fmt={format:d.getUint16(i+8,true),channels:d.getUint16(i+10,true),rate:d.getUint32(i+12,true),align:d.getUint16(i+20,true),bits:d.getUint16(i+22,true)};
        if(tag(i)==='data'){offset=i+8;size=n;}i+=8+n+(n%2);
      }
      if(!fmt||offset===undefined||fmt.format!==1||fmt.bits!==16)throw Error('この解析では16-bit PCM WAVを使用します');
      const channels=Array.from({length:fmt.channels},()=>new Float64Array(Math.floor(size/fmt.align)));
      for(let i=0;i<channels[0].length;i++)for(let c=0;c<fmt.channels;c++)channels[c][i]=d.getInt16(offset+i*fmt.align+2*c,true)/32768;
      return {...fmt,channels};
    }
    function fft(re,im){
      const n=re.length;
      for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
      for(let size=2;size<=n;size*=2){const theta=-2*Math.PI/size,wr=Math.cos(theta),wi=Math.sin(theta);
        for(let start=0;start<n;start+=size){let ar=1,ai=0;for(let j=0;j<size/2;j++){
          const a=start+j,b=a+size/2,tr=ar*re[b]-ai*im[b],ti=ar*im[b]+ai*re[b];
          re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
          const next=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=next;
        }}
      }
    }
    function stft(audio,seconds=.512,progress=()=>{}){
      const length=audio.channels[0].length,windowSize=Math.round(audio.rate*seconds),hop=Math.max(1,Math.round(windowSize/4));
      const fftSize=2**Math.ceil(Math.log2(windowSize)),power=new Float64Array(fftSize/2+1);
      const window=Float64Array.from({length:windowSize},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/windowSize));
      const scale=window.reduce((a,b)=>a+b,0)**2,re=new Float64Array(fftSize),im=new Float64Array(fftSize);
      const frames=Math.ceil((length-1)/hop)+1;
      for(let frame=0;frame<frames;frame++){
        const start=frame*hop-Math.floor(windowSize/2);
        for(const channel of audio.channels){
          re.fill(0);im.fill(0);for(let j=0;j<windowSize;j++){const k=start+j;if(k>=0&&k<length)re[j]=channel[k]*window[j];}
          fft(re,im);for(let k=0;k<power.length;k++)power[k]+=(re[k]**2+im[k]**2)/scale;
        }
        if(frame%32===0)progress(frame/frames);
      }
      for(let k=0;k<power.length;k++)power[k]/=frames*audio.channels.length;
      return {power,rate:audio.rate,fftSize,windowSize,hop,frames,duration:length/audio.rate,channels:audio.channels.length};
    }
    function sample(spectrum,f){
      // Only references inside C0..C10 and the recording's Nyquist band count.
      if(f<C0||f>Math.min(LIMIT,spectrum.rate/2))return 0;
      const k=f*spectrum.fftSize/spectrum.rate,i=Math.floor(k),a=k-i,p=spectrum.power;
      if(i>=p.length-1)return p[p.length-1];return p[i]*(1-a)+p[i+1]*a;
    }
    function components(spectrum,f){
      let h=0,s=0;for(let n=2;n<=N;n++){h+=sample(spectrum,n*f)/(n*n);s+=sample(spectrum,f/n)/(n*n);}
      return [sample(spectrum,f),h,s];
    }
    function grid(spectrum){
      const p=new Float64Array(12001),h=new Float64Array(12001),s=new Float64Array(12001);
      for(let i=0;i<=12000;i++){const a=components(spectrum,C0*2**(i/1200));p[i]=a[0];h[i]=a[1];s[i]=a[2];}
      return {p,h,s};
    }
    function fold(g,average=true){
      const p=new Float64Array(1201),h=new Float64Array(1201),s=new Float64Array(1201);
      // Half-open ten-octave domain avoids double-counting C10 at the seam.
      for(let j=0;j<1200;j++){
        const cents=j-50,indices=[];for(let k=-1;k<=10;k++){const i=cents+k*1200;if(i>=0&&i<12000)indices.push(i);}
        for(const i of indices){p[j]+=g.p[i];h[j]+=g.h[i];s[j]+=g.s[i];}
        if(average){p[j]/=indices.length;h[j]/=indices.length;s[j]/=indices.length;}
      }
      p[1200]=p[0];h[1200]=h[0];s[1200]=s[0];return {p,h,s};
    }
    function project(g,type){
      const y=new Float64Array(g.p.length),phase=new Float64Array(g.p.length);
      for(let i=0;i<y.length;i++){
        const p=g.p[i],h=g.h[i],s=g.s[i],q=h-s;
        if(type==='power')y[i]=p;
        if(type==='polarity')y[i]=q;
        if(type==='fusion')y[i]=p+q/W;
        if(type==='minor-fusion')y[i]=-p+q/W;
        if(type==='vector'||type==='three-phase'){
          const re=type==='vector'?p:W*p-(h+s)/2,im=type==='vector'?q/W:Math.sqrt(3)/2*q;
          y[i]=Math.hypot(re,im);phase[i]=y[i]>0?Math.atan2(im,re)*180/Math.PI:NaN;
        }
      }return {y,phase};
    }
    function bin12(g){
      // Each 100-cent interval includes both edges with half trapezoid weight.
      // Input starts at C - 50 cents, with a periodic endpoint at index 1200.
      const out={};
      for(const key of ['p','h','s']){
        out[key]=Float64Array.from({length:12},(_,n)=>{
          let sum=0;for(let j=0;j<=100;j++)sum+=g[key][n*100+j]*(j===0||j===100?.5:1);
          return sum/100;
        });
      }
      return out;
    }
    return {C0,LIMIT,N,W,wav,fft,stft,sample,components,grid,fold,project,bin12};
  }
  const api=createEngine();
  api.workerSource=`const engine=(${createEngine.toString()})();onmessage=e=>{try{const audio=engine.wav(e.data.buffer);const spectrum=engine.stft(audio,e.data.seconds,p=>postMessage({progress:p}));const grid=engine.grid(spectrum);postMessage({result:{grid,meta:{rate:spectrum.rate,fftSize:spectrum.fftSize,windowSize:spectrum.windowSize,hop:spectrum.hop,frames:spectrum.frames,duration:spectrum.duration,channels:spectrum.channels}}});}catch(error){postMessage({error:error.message});}};`;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MusicAnalysis=api;
})(globalThis);
