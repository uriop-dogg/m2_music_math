'use strict';
(() => {
  const E=window.MusicAnalysis, cache=new Map();
  const audioErrors={"RIFF/WAVE\u5f62\u5f0f\u3067\u306f\u3042\u308a\u307e\u305b\u3093": "Not a RIFF/WAVE file", "WAV\u304c\u9014\u4e2d\u3067\u5207\u308c\u3066\u3044\u307e\u3059": "The WAV file is truncated", "\u3053\u306e\u89e3\u6790\u3067\u306f16-bit PCM WAV\u3092\u4f7f\u7528\u3057\u307e\u3059": "This analysis requires a 16-bit PCM WAV file"};
  const notes=['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];
  const number=x=>Number.isFinite(x)?(Math.abs(x)<.01&&x!==0?x.toExponential(3):x.toPrecision(4)):'—';
  const phaseColor=(deg,type)=>`hsl(${120-deg*(type==='vector'?120/90:1)} 96% 57%)`;
  function analysis(name,notify){
    if(cache.has(name)){const item=cache.get(name);item.listeners.push(notify);return item.promise;}
    const item={listeners:[notify]};cache.set(name,item);
    item.promise=new Promise((resolve,reject)=>{
      let worker,url;
      try{
        if(!window.Worker)throw Error('A browser with Web Worker support is required');
        const binary=atob(window.ResearchAudio[name]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
        url=URL.createObjectURL(new Blob([E.workerSource],{type:'text/javascript'}));worker=new Worker(url);
        const clean=()=>{worker.terminate();URL.revokeObjectURL(url);};
        worker.onmessage=e=>{
          if(e.data.error){clean();reject(Error(audioErrors[e.data.error]||e.data.error));}
          else if(e.data.result){clean();resolve(e.data.result);}
          else item.listeners.forEach(fn=>fn(Math.round(e.data.progress*100)));
        };
        worker.onerror=e=>{clean();reject(Error(e.message||'Analysis failed'));};
        worker.postMessage({buffer:bytes.buffer,seconds:.512},[bytes.buffer]);
      }catch(error){if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);reject(error);}
    });
    item.promise.catch(()=>cache.delete(name));return item.promise;
  }
  class Graph{
    constructor(host){
      this.host=host;this.bars=host.dataset.kind==='polarity-bins';this.type=this.bars?'polarity':host.dataset.kind;this.audio=host.dataset.audio;this.single=this.audio==='single';
      this.pitch=host.dataset.view==='pitch';this.mean=true;this.xmin=0;this.xmax=12000;this.hover=null;
      this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
      this.status=host.querySelector('[data-graph-status]');this.readout=host.querySelector('[data-readout]');this.meta=host.querySelector('[data-meta]');
      this.legend=host.querySelector('[data-legend]');this.pointers=new Map();
      host.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b.dataset.action)));
      host.querySelector('[data-view]')?.addEventListener('change',e=>{this.pitch=e.target.value==='pitch';this.update();});
      host.querySelector('[data-fold]')?.addEventListener('change',e=>{this.mean=e.target.value==='mean';this.update();});
      host.querySelector('[data-root]')?.addEventListener('input',e=>{this.root=Number(e.target.value);this.update();});
      this.canvas.addEventListener('wheel',e=>{if(!this.data||document.activeElement!==this.canvas)return;e.preventDefault();const pos=this.position(e);this.zoom(Math.exp(Math.sign(e.deltaY)*.18),pos.x,pos.y);},{passive:false});
      this.canvas.addEventListener('pointerdown',e=>{
        if(!this.data)return;this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.position(e));this.hover=this.position(e).x;this.hoverY=this.position(e).y;this.inspect(this.hover);this.draw();this.beginGesture();
      });
      this.canvas.addEventListener('pointermove',e=>{
        if(!this.data)return;const pos=this.position(e);
        if(this.pointers.has(e.pointerId)){
          this.pointers.set(e.pointerId,pos);const points=[...this.pointers.values()];
          if(points.length===1&&this.drag){const dx=(pos.x-this.drag.x)/this.pw*(this.drag.xmax-this.drag.xmin),dy=(pos.y-this.drag.y)/this.ph*(this.drag.ymax-this.drag.ymin);
            if(this.axis()!=='y'){this.xmin=this.drag.xmin-dx;this.xmax=this.drag.xmax-dx;this.clampX();}
            if(this.axis()!=='x'){this.ymin=this.drag.ymin+dy;this.ymax=this.drag.ymax+dy;}
          }else if(points.length===2&&this.pinch){
            const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),center={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
            this.zoom(this.pinch.distance/Math.max(distance,1),center.x,center.y);this.pinch={distance};
          }this.draw();
        }else{this.hover=pos.x;this.hoverY=pos.y;this.draw();this.inspect(pos.x);}
      });
      const release=e=>{this.pointers.delete(e.pointerId);this.beginGesture();};
      this.canvas.addEventListener('pointerup',release);this.canvas.addEventListener('pointercancel',release);
      this.canvas.addEventListener('pointerleave',()=>{if(!this.pointers.size){this.hover=null;this.draw();}});
      this.canvas.addEventListener('keydown',e=>{
        if(!this.data)return;const actions={'+':'in','=':'in','-':'out',ArrowLeft:'left',ArrowRight:'right',r:'reset',R:'reset'};
        if(actions[e.key]){e.preventDefault();this.action(actions[e.key]);}
      });
      this.resize=()=>{const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);this.width=rect.width;this.height=rect.height;this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw();};
      new ResizeObserver(this.resize).observe(this.canvas);
      document.addEventListener('fullscreenchange',()=>{host.querySelector('[data-action="expand"]').textContent=document.fullscreenElement===host?'Reduce':'Expand';this.resize();});
      if(this.single){this.root=440*2**(-9/12);this.update();this.status.textContent='Pure-tone relationships calculated from the formulas';this.status.hidden=true;}
    }
    axis(){return this.host.querySelector('[data-axis]').value;}
    beginGesture(){const p=[...this.pointers.values()];this.drag=p.length===1?{...p[0],xmin:this.xmin,xmax:this.xmax,ymin:this.ymin,ymax:this.ymax}:null;this.pinch=p.length===2?{distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:null;}
    position(e){const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
    async load(){
      if(this.loaded||this.single)return;this.loaded=true;
      this.status.textContent='Calculating the full-duration STFT average from the audio…';
      try{
        this.result=await analysis(this.audio,p=>{this.status.textContent=`Calculating the full-duration STFT average… ${p}%`;});
        this.update();this.status.textContent='Complete · full-duration STFT average';this.status.hidden=true;
      }catch(e){this.loaded=false;this.status.textContent=`Analysis failed: ${e.message}. Use Retry to try again.`;this.host.querySelector('[data-action="retry"]').hidden=false;}
    }
    update(){
      const isVector=['vector','three-phase'].includes(this.type);
      this.legend.hidden=!isVector;
      if(isVector){this.legend.className='phase-legend '+this.type;this.legend.innerHTML=this.type==='vector'?'<span>Phase −90° (blue)</span><span>0° (green)</span><span>+90° (red)</span>':'<span>−180°</span><span>S −120° (blue)</span><span>P 0° (green)</span><span>H +120° (red)</span><span>+180°</span>';}
      this.host.querySelector('[data-fold-label]')?.toggleAttribute('hidden',!this.pitch);
      if(this.single){
        const points=[];for(let n=2;n<=32;n++){points.push({x:1200*Math.log2(this.root/n/E.C0),y:1/n**2,label:`f₀/${n}：+1/${n}²`});points.push({x:1200*Math.log2(this.root*n/E.C0),y:-1/n**2,label:`${n}f₀：−1/${n}²`});}points.sort((a,b)=>a.x-b.x);
        this.data={x:points.map(p=>p.x),y:points.map(p=>p.y),points};this.domain=[0,12000];
        this.meta.textContent=`f₀ = ${this.root.toFixed(2)} Hz, v = 1, n = 2…32, wₙ = 1/n². Positions and heights are calculated analytically (no STFT). At f₀ itself, Q = 0.`;
      }else{
        if(!this.result)return;if(this.bars)this.pitch=true;
        let g=this.pitch?E.fold(this.result.grid,this.mean):this.result.grid;
        if(this.bars)g=E.bin12(g);
        const projected=E.project(g,this.type);
        this.data={...projected,g,x:Float64Array.from({length:g.p.length},(_,i)=>this.bars?i*100:this.pitch?i-50:i)};
        this.domain=this.pitch?[-50,1150]:[0,12000];
        const m=this.result.meta;
        this.meta.textContent=`${this.audio==='bach'?'Bach C major Prelude':this.audio==='minor'?'Equal-amplitude C minor':'Equal-amplitude C major'} / ${m.duration.toFixed(2)} s, ${m.rate} Hz, ${m.channels} channel(s). Periodic Hann window: ${m.windowSize} samples (512 ms); hop: ${m.hop} samples (75% overlap); FFT: ${m.fftSize} samples; ${m.frames} frames. Window centers advance by one hop through or beyond the end of the recording, with zero padding at both ends. P = time average of |FFT / sum(window)|², one-sided display without a factor-of-two correction. Linear interpolation between frequency bins. n = 2…32, wₙ = 1/n², W = ${E.W.toFixed(8)}. P is referenced from C0 to min(C10, Nyquist frequency ${m.rate/2} Hz); values outside that range are zero. Q and related quantities are evaluated from C0 to C10 at 1-cent intervals. ${this.pitch?`Octave aggregation: ${this.mean?'mean':'sum'} over ten octaves, C0 inclusive to C10 exclusive. Complex real and imaginary components are aggregated before calculating magnitude and phase.`:''}`;
      }
      if(this.bars)this.meta.textContent+=' Q is averaged on the cent axis from −50 to +50 cents around each note in 12-tone equal temperament. A trapezoidal rule at 1-cent intervals uses half weight at the two endpoints, then divides by 100 cents. Classification uses the sign of the interval mean.';
      this.host.querySelector('[data-graph-subtitle]').textContent=this.single?'Horizontal: pitch (log frequency) · Vertical: Q / v':`${this.pitch?'Pitch class · '+(this.mean?'Octave mean':'Octave sum'):'Pitch · log frequency'} / ${isVector?'Height: magnitude; color: phase':'Vertical: linear value'} / n ≤ 32・1/n²`;
      this.peaks=[];
      if(isVector&&this.data){
        const ys=this.data.y,last=ys.length-1;
        for(let i=0;i<last;i++){
          if(!this.pitch&&i===0)continue;
          const before=i===0?ys[last-1]:ys[i-1];
          if(ys[i]>before&&ys[i]>=ys[i+1]&&Number.isFinite(this.data.phase[i]))this.peaks.push(i);
        }
      }
      this.reset();
    }
    reset(){
      if(!this.data)return;
      [this.xmin,this.xmax]=this.domain;
      if(!this.pitch){
        // Ignore numerical/window leakage tails for the initial viewport only.
        // All samples and the full navigation domain remain available.
        let peak=0;for(const y of this.data.y)peak=Math.max(peak,Math.abs(y));
        if(peak>0){
          let lo=Infinity,hi=-Infinity;
          for(let i=0;i<this.data.x.length;i++){
            const x=this.data.x[i];
            if(x>=this.domain[0]&&x<=this.domain[1]&&Math.abs(this.data.y[i])>=peak*1e-4){lo=Math.min(lo,x);hi=Math.max(hi,x);}
          }
          if(Number.isFinite(lo)){this.xmin=Math.max(this.domain[0],Math.floor((lo-100)/100)*100);this.xmax=Math.min(this.domain[1],Math.ceil((hi+100)/100)*100);}
        }
      }
      this.fitY();this.hover=null;this.draw();
    }
    fitY(){let min=0,max=0;for(let i=0;i<this.data.x.length;i++){if(this.data.x[i]<this.xmin||this.data.x[i]>this.xmax)continue;const y=this.data.y[i];min=Math.min(min,y);max=Math.max(max,y);}const span=max-min||1;this.ymin=min<0?min-span*.08:0;this.ymax=max+span*.12;}
    clampX(){const [lo,hi]=this.domain;let span=Math.max(10,Math.min(hi-lo,this.xmax-this.xmin));this.xmin=Math.min(hi-span,Math.max(lo,this.xmin));this.xmax=this.xmin+span;}
    zoom(factor,px=(this.left+this.pw/2),py=(this.top+this.ph/2)){
      if(!this.data)return;const ax=Math.max(0,Math.min(1,(px-this.left)/this.pw)),ay=Math.max(0,Math.min(1,(py-this.top)/this.ph));
      if(this.axis()!=='y'){const x=this.xmin+ax*(this.xmax-this.xmin),span=(this.xmax-this.xmin)*factor;this.xmin=x-ax*span;this.xmax=this.xmin+span;this.clampX();}
      if(this.axis()!=='x'){const span=(this.ymax-this.ymin)*factor;if(span>1e-15&&span<1e6){const y=this.ymax-ay*(this.ymax-this.ymin);this.ymax=y+ay*span;this.ymin=this.ymax-span;}}
      this.draw();
    }
    async action(action){
      if(action==='retry'){this.host.querySelector('[data-action="retry"]').hidden=true;this.load();return;}
      if(action==='expand'){try{if(document.fullscreenElement===this.host)await document.exitFullscreen();else await this.host.requestFullscreen();}catch(_){this.host.classList.toggle('graph-enlarged');this.host.querySelector('[data-action="expand"]').textContent=this.host.classList.contains('graph-enlarged')?'Reduce':'Expand';}return;}
      if(!this.data)return;
      if(action==='in')this.zoom(.65);if(action==='out')this.zoom(1/.65);if(action==='reset')this.reset();
      if(action==='fit'){this.fitY();this.draw();}
      if(action==='left'||action==='right'){const d=(this.xmax-this.xmin)*.2*(action==='left'?-1:1);this.xmin+=d;this.xmax+=d;this.clampX();this.draw();}
      if(action==='csv')this.csv();
    }
    draw(){
      if(!this.width)return;const ctx=this.ctx,w=this.width,h=this.height;
      ctx.clearRect(0,0,w,h);ctx.fillStyle='#191a1c';ctx.fillRect(0,0,w,h);
      this.left=w<500?65:79;this.top=27;this.pw=w-this.left-20;this.ph=h-this.top-63;
      if(!this.data){ctx.fillStyle='#bbc5ce';ctx.font='13px sans-serif';ctx.fillText('Preparing graph',this.left,60);return;}
      const px=x=>this.left+(x-this.xmin)/(this.xmax-this.xmin)*this.pw,py=y=>this.top+(this.ymax-y)/(this.ymax-this.ymin)*this.ph;
      ctx.font='11px sans-serif';ctx.textBaseline='middle';
      for(let i=0;i<=3;i++){const y=this.ymin+(this.ymax-this.ymin)*i/3,yp=py(y);ctx.strokeStyle='#383b40';ctx.beginPath();ctx.moveTo(this.left,yp);ctx.lineTo(w-20,yp);ctx.stroke();ctx.fillStyle='#69c4df';ctx.textAlign='right';ctx.fillText(number(y),this.left-7,yp);}
      if(this.ymin<=0&&this.ymax>=0){ctx.strokeStyle='#91969e';ctx.beginPath();ctx.moveTo(this.left,py(0));ctx.lineTo(w-20,py(0));ctx.stroke();}
      const range=this.xmax-this.xmin,step=this.bars?100:this.pitch?(range>500?(w<500?200:100):range>150?50:10):(range>5000?1200:range>1500?300:range>400?100:range>100?25:5);
      let lastLabel=-1000;
      for(let t=Math.ceil(this.xmin/step)*step;t<=this.xmax;t+=step){const xp=px(t);ctx.strokeStyle='#555b65';ctx.beginPath();ctx.moveTo(xp,h-63);ctx.lineTo(xp,h-58);ctx.stroke();if(!this.bars&&xp-lastLabel<(this.pitch?45:65))continue;lastLabel=xp;ctx.fillStyle='#c3c8d0';ctx.textAlign='center';
        const semitone=Math.round(t/100),oct=Math.floor(semitone/12),note=notes[((semitone%12)+12)%12],deviation=Math.round(t-semitone*100);
        if(this.bars){const parts=note.split('/');ctx.font=(w<500?'9':'11')+'px sans-serif';ctx.fillText(parts[0],xp,h-43);if(parts[1])ctx.fillText(parts[1],xp,h-27);}
        else ctx.fillText(note+(this.pitch?'':oct)+(deviation?`${deviation>0?'+':''}${deviation}¢`:''),xp,h-43);
        if(!this.pitch)ctx.fillText((E.C0*2**(t/1200)).toFixed(range>3000?1:2)+' Hz',xp,h-24);
      }
      ctx.save();ctx.beginPath();ctx.rect(this.left,this.top,this.pw,this.ph);ctx.clip();
      const vector=['vector','three-phase'].includes(this.type);ctx.lineWidth=1.25;
      if(this.bars){ctx.fillStyle='#77d5ee';for(let i=0;i<12;i++){const x=px(i*100),y=py(this.data.y[i]),zero=py(0),width=75/(this.xmax-this.xmin)*this.pw;ctx.fillRect(x-width/2,Math.min(y,zero),width,Math.max(1,Math.abs(y-zero)));}}
      else if(this.single){for(let i=0;i<this.data.x.length;i++){const x=px(this.data.x[i]),y=py(this.data.y[i]);ctx.strokeStyle='#77d5ee';ctx.beginPath();ctx.moveTo(x,py(0));ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill();}}
      else if(vector){for(let i=1;i<this.data.x.length;i++){if(this.data.x[i]<this.xmin||this.data.x[i-1]>this.xmax)continue;ctx.strokeStyle=phaseColor(this.data.phase[i],this.type);ctx.beginPath();ctx.moveTo(px(this.data.x[i-1]),py(this.data.y[i-1]));ctx.lineTo(px(this.data.x[i]),py(this.data.y[i]));ctx.stroke();}}
      else{ctx.strokeStyle='#77d5ee';ctx.beginPath();let started=false;for(let i=0;i<this.data.x.length;i++){if(this.data.x[i]<this.xmin-1||this.data.x[i]>this.xmax+1)continue;const x=px(this.data.x[i]),y=py(this.data.y[i]);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.stroke();}
      if(this.hover!==null&&this.hover>=this.left&&this.hover<=w-20){ctx.strokeStyle='#ffffff55';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(this.hover,this.top);ctx.lineTo(this.hover,this.top+this.ph);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();
      if(vector){
        const visible=(this.peaks||[]).filter(i=>this.data.x[i]>=this.xmin&&this.data.x[i]<=this.xmax&&py(this.data.y[i])>=this.top&&py(this.data.y[i])<=this.top+this.ph);
        const distance=i=>Math.hypot(px(this.data.x[i])-this.hover,py(this.data.y[i])-(this.hoverY??py(this.data.y[i])));
        const nearest=this.hover===null?undefined:visible.reduce((a,i)=>a===undefined||distance(i)<distance(a)?i:a,undefined);
        const hovered=nearest!==undefined&&distance(nearest)<=22?nearest:undefined;
        const candidates=this.pitch?visible.sort((a,b)=>this.data.y[b]-this.data.y[a]):[];
        if(hovered!==undefined){const at=candidates.indexOf(hovered);if(at>=0)candidates.splice(at,1);candidates.unshift(hovered);}
        const boxes=[];ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        for(const i of candidates){
          const x=px(this.data.x[i]),y=py(this.data.y[i]),tx=Math.max(this.left+28,Math.min(w-48,x)),ty=Math.max(10,y-18);
          // Do not stack labels from adjacent peaks: prefer the taller peak.
          // Hovering the actual smaller peak brings its label to the front.
          if(boxes.some(b=>Math.abs(b.anchor-x)<35||Math.abs(b.x-tx)<58&&Math.abs(b.y-ty)<16))continue;
          boxes.push({x:tx,y:ty,anchor:x});ctx.strokeStyle='#c9dbe8';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty+7);ctx.stroke();
          ctx.fillStyle=i===hovered?'#fff':'#d7e5ef';ctx.beginPath();ctx.arc(x,y,i===hovered?3.5:2.5,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#191a1ce8';ctx.fillRect(tx-27,ty-7,54,14);ctx.fillStyle='#e3eff8';
          const deg=this.data.phase[i];ctx.fillText(`${deg>=0?'+':''}${deg.toFixed(1)}°`,tx,ty);
        }
      }
    }
    inspect(px){
      const x=this.xmin+(px-this.left)/this.pw*(this.xmax-this.xmin);let i;
      if(this.single){i=this.data.x.reduce((best,v,j)=>Math.abs(v-x)<Math.abs(this.data.x[best]-x)?j:best,0);}
      else i=Math.max(0,Math.min(this.data.x.length-1,Math.round(this.bars?x/100:x+(this.pitch?50:0))));
      const t=this.data.x[i],semi=Math.round(t/100),label=notes[((semi%12)+12)%12]+(this.pitch?'':Math.floor(semi/12)),cents=t-semi*100;
      let text=`${label} ${cents>=0?'+':''}${cents.toFixed(1)} cent${this.pitch?'':` / ${(E.C0*2**(t/1200)).toFixed(2)} Hz`} · Value ${number(this.data.y[i])}`;
      if(this.single)text+=` · ${this.data.points[i].label}`;
      else{if(['vector','three-phase'].includes(this.type))text+=` · Phase ${number(this.data.phase[i])}°`;text+=` · P ${number(this.data.g.p[i])} / H ${number(this.data.g.h[i])} / S ${number(this.data.g.s[i])}`;}
      this.readout.textContent=text;
    }
    csv(){
      const rows=[this.single?'cents_from_C0,Hz,Q_over_v':`${this.pitch?'pitch_class_cents_from_C':'cents_from_C0'},${this.pitch?'reference_Hz_C0':'Hz'},P,H,S,Q,value,phase_degrees`];
      for(let i=0;i<this.data.x.length;i++){const x=this.data.x[i];if(x<this.xmin||x>this.xmax)continue;const row=[x,E.C0*2**(x/1200)];if(this.single)row.push(this.data.y[i]);else{const g=this.data.g;row.push(g.p[i],g.h[i],g.s[i],g.h[i]-g.s[i],this.data.y[i],['vector','three-phase'].includes(this.type)?this.data.phase[i]:'');}rows.push(row.join(','));}
      const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`${this.host.id}-${this.pitch?(this.mean?'mean':'sum'):'pitch'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  const graphs=[...document.querySelectorAll('[data-research-graph]')].map(host=>new Graph(host));
  if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){graphs.find(g=>g.host===entry.target)?.load();observer.unobserve(entry.target);}},{rootMargin:'400px'});graphs.forEach(g=>observer.observe(g.host));}else graphs.forEach(g=>g.load());
})();
