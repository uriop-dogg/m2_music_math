'use strict';
// Every ratio is a frequency multiplier. Never fold audition pitches implicitly.
let context, master, limiter, audioEpoch=0, statusTimer;
const voices=new Set(), cleanups=new Set();
const status=document.querySelector('#audio-status');
function message(s){status.textContent=s;clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.textContent='',4500);}
async function ready(){
 if(!context){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('This browser does not support audio synthesis.');context=new AC();master=context.createGain();master.gain.value=Number(document.querySelector('#volume').value);limiter=context.createDynamicsCompressor();limiter.threshold.value=-7;limiter.knee.value=10;limiter.ratio.value=12;master.connect(limiter);limiter.connect(context.destination);}
 await context.resume();
}
function note(freq,duration=null,delay=0){
 if(!Number.isFinite(freq)||freq<20||freq>Math.min(20000,context.sampleRate*.49))return null;
 const oscillator=context.createOscillator(),gain=context.createGain(),t=context.currentTime+delay;
 oscillator.type='sine';oscillator.frequency.value=freq;
 gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.15,t+.035);
 oscillator.connect(gain);gain.connect(master);oscillator.start(t);
 let stopped=false;
 const v={stop(){if(stopped)return;stopped=true;const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(now<t?0:gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+.06);oscillator.stop(now+.07);}};
 voices.add(v);oscillator.onended=()=>{voices.delete(v);oscillator.disconnect();gain.disconnect();};
 if(duration!=null){gain.gain.setValueAtTime(.15,t+Math.max(.04,duration-.09));gain.gain.linearRampToValueAtTime(0,t+duration);oscillator.stop(t+duration+.02);}
 return v;
}
function stopAll(){audioEpoch++;for(const fn of [...cleanups])fn();for(const v of [...voices])v.stop();document.querySelectorAll('.sounding').forEach(e=>e.classList.remove('sounding'));}
document.querySelector('#stop-all').onclick=stopAll;
document.querySelector('#volume').oninput=e=>{if(master)master.gain.setTargetAtTime(Number(e.target.value),context.currentTime,.025);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});window.addEventListener('pagehide',stopAll);
function rootFor(el){const input=el.closest('.sound-block,.lattice')?.querySelector('.root-input');return input?Number(input.value):Number(el.closest('[data-root-hz]')?.dataset.rootHz||523);}
function highlight(el,yes){el.classList.toggle('sounding',yes);}
function bindMoment(el,ratios,roll=false){
 // All floating ratio and chord boxes sustain until the pointer leaves.
 let generation=0,current=[];
 function stop(){generation++;for(const v of current)v?.stop();current=[];highlight(el,false);cleanups.delete(stop);}
 async function play(){stop();const g=generation,epoch=audioEpoch;cleanups.add(stop);try{await ready();if(g!==generation||epoch!==audioEpoch)return;const root=rootFor(el);current=ratios.map((r,i)=>note(root*r,null,roll?i*.12:0));if(!current.some(Boolean)){message('The playable range is 20–20,000 Hz.');stop();return;}highlight(el,true);}catch(e){message(e.message);stop();}}
 el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')play();});el.addEventListener('pointerleave',stop);
 // A click also unlocks audio on browsers that do not allow hover to start it.
 el.addEventListener('click',play);el.addEventListener('blur',stop);el.addEventListener('pointercancel',stop);
}
document.querySelectorAll('.tone:not(.play-lattice .tone)').forEach(el=>bindMoment(el,[Number(el.dataset.ratio)]));
document.querySelectorAll('[data-chord]').forEach(el=>bindMoment(el,el.dataset.chord.split(',').map(Number),el.hasAttribute('data-roll')));
// A single note label selects the entire prefix of the dominant voicing.
document.querySelectorAll('.rolling-notes').forEach(group=>{
 const buttons=[...group.querySelectorAll('[data-roll-note]')];let generation=0;const active=new Map();
 function stop(){generation++;active.forEach(v=>v.stop());active.clear();buttons.forEach(b=>highlight(b,false));cleanups.delete(stop);}
 async function play(index){
  const g=++generation,epoch=audioEpoch;cleanups.add(stop);
  // Keep the common prefix sounding; only add/remove changed notes.
  for(const [i,v] of active)if(i>index){v.stop();active.delete(i);}
  buttons.forEach((b,i)=>highlight(b,i<=index&&active.has(i)));
  try{await ready();if(g!==generation||epoch!==audioEpoch)return;
   for(let i=0;i<=index;i++)if(!active.has(i)){const v=note(rootFor(buttons[i])*Number(buttons[i].dataset.rollNote));if(v)active.set(i,v);}
   buttons.forEach((b,i)=>highlight(b,active.has(i)));
  }catch(e){message(e.message);stop();}
 }
 buttons.forEach((b,i)=>{b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')play(i);});b.addEventListener('click',()=>play(i));});
 group.addEventListener('pointerleave',stop);
 group.addEventListener('focusout',e=>{if(!group.contains(e.relatedTarget))stop();});
});
document.querySelectorAll('.play-lattice').forEach(grid=>{
 let generation=0,current=null,voice=null;
 function off(){generation++;voice?.stop();voice=null;if(current)highlight(current,false);current=null;cleanups.delete(off);}
 grid.querySelector('.local-off').onclick=off;
 function update(){off();grid.querySelectorAll('.tone').forEach(el=>{const f=rootFor(el)*Number(el.dataset.ratio);el.disabled=f<20||f>20000;el.title=f.toFixed(2)+' Hz';});}
 grid.querySelector('.root-input').addEventListener('input',update);
 async function play(el){
  if(el.disabled)return;if(current===el&&voice)return;off();current=el;
  const g=generation,epoch=audioEpoch;cleanups.add(off);
  try{await ready();if(g!==generation||epoch!==audioEpoch)return;voice=note(rootFor(el)*Number(el.dataset.ratio));if(voice)highlight(el,true);else off();}catch(e){message(e.message);off();}
 }
 grid.querySelectorAll('.tone').forEach(el=>{
  el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')play(el);});
  el.addEventListener('pointerleave',()=>{if(current===el)off();});
  el.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')play(el);});
  el.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse'&&current===el)off();});
  el.addEventListener('pointercancel',()=>{if(current===el)off();});
  el.addEventListener('click',e=>{if(e.pointerType==='mouse')play(el);});
  el.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();play(el);}});
  el.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(current===el)off();}});
  el.addEventListener('blur',()=>{if(current===el)off();});
 });update();
});

document.querySelectorAll('.sequence').forEach(button=>{
 let cancel=null,version=0;
 button.onclick=async()=>{
  if(cancel){cancel();return;}
  stopAll();const epoch=audioEpoch,g=++version,timers=[],active=[],block=button.closest('.sound-block'),els=[...block.querySelectorAll('.tone')],ratios=button.dataset.sequence.split(',').map(Number);
  const finish=()=>{version++;for(const t of timers)clearTimeout(t);for(const v of active)v?.stop();els.forEach(el=>highlight(el,false));button.textContent='▶ Play scale';button.setAttribute('aria-pressed','false');cancel=null;cleanups.delete(finish);};
  cancel=finish;cleanups.add(finish);button.textContent='■ Stop';button.setAttribute('aria-pressed','true');
  try{await ready();if(epoch!==audioEpoch||g!==version)return;const root=rootFor(button);ratios.forEach((r,i)=>{active.push(note(root*r,.8,i*.75));timers.push(setTimeout(()=>{els.forEach(el=>highlight(el,false));highlight(els[i],true);},i*750));});timers.push(setTimeout(finish,ratios.length*750+100));}catch(e){message(e.message);finish();}
 };
});
document.querySelectorAll('.root-input').forEach(el=>el.addEventListener('change',()=>{if(!el.checkValidity()){el.value=el.defaultValue;message('Choose a fundamental frequency between 20 and 2,000 Hz.');}stopAll();}));

// The diagram's connections are laid out from the actual table cell positions.
function drawTraces(){document.querySelectorAll('svg.trace').forEach(svg=>{
 const parent=svg.parentElement,rect=parent.getBoundingClientRect(),cells=[...parent.querySelectorAll('td')];
 const byValue=new Map(cells.map(c=>[Number(c.dataset.value),c]));
 const center=c=>{const r=c.getBoundingClientRect();return {x:r.left-rect.left+r.width/2,y:r.top-rect.top+r.height/2};};
 const one=center(byValue.get(1)),three=center(byValue.get(3)),two=center(byValue.get(2));
 const right=rect.width-5,top=byValue.get(16).getBoundingClientRect().top-rect.top-5;
 function position(n){if(byValue.has(n))return center(byValue.get(n));let odd=n,power=0;while(odd%2===0){odd/=2;power++;}return {x:one.x+(odd-1)/2*(three.x-one.x),y:one.y+power*(two.y-one.y)};}
 // Clip a connection to the displayed grid, retaining an arrowhead at the exit.
 function boundary(inside,outside){let t=1;const dx=outside.x-inside.x,dy=outside.y-inside.y;
  if(outside.x>right)t=Math.min(t,(right-inside.x)/dx);
  if(outside.y<top)t=Math.min(t,(top-inside.y)/dy);
  return {x:inside.x+t*dx,y:inside.y+t*dy};
 }
 svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
 svg.innerHTML='<defs><marker id="trace-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#ad633d"/></marker></defs>';
 const starts=new Set();byValue.forEach((c,n)=>{starts.add(n);if(n>1)starts.add(n-1);});
 for(const n of [...starts].sort((a,b)=>a-b)){
  const fromVisible=byValue.has(n),toVisible=byValue.has(n+1);let a=position(n),b=position(n+1);
  if(!fromVisible)a=boundary(b,a);if(!toVisible)b=boundary(a,b);
  const len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len,pad=Math.min(22,len/3);
  svg.innerHTML+=`<line data-from="${n}" data-to="${n+1}" x1="${a.x+(fromVisible?pad*ux:0)}" y1="${a.y+(fromVisible?pad*uy:0)}" x2="${b.x-(toVisible?pad*ux:0)}" y2="${b.y-(toVisible?pad*uy:0)}" stroke="#ad633d" stroke-opacity=".62" stroke-width="1.5" marker-end="url(#trace-arrow)"/>`;
 }
});}
new ResizeObserver(drawTraces).observe(document.querySelector('main'));document.fonts.ready.then(drawTraces);
const names=['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];
function circle(){const svg=document.querySelector('#pitch-circle');let s='<circle cx="320" cy="285" r="185" fill="none" stroke="#bbc9d6" stroke-width="1.5"/>';names.forEach((name,i)=>{const a=i*Math.PI/6-Math.PI/2,x=320+185*Math.cos(a),y=285+185*Math.sin(a),tx=320+239*Math.cos(a),ty=285+239*Math.sin(a);const midi=i>=9?60+i:72+i,f=440*2**((midi-69)/12);s+=`<line x1="320" y1="285" x2="${x}" y2="${y}" stroke="#e8edf1"/><circle cx="${x}" cy="${y}" r="5" fill="${i===0?'#ae5459':'#366c91'}"/><text x="${tx}" y="${ty-3}" text-anchor="middle" font-size="17" fill="#192735">${name}</text><text x="${tx}" y="${ty+18}" text-anchor="middle" font-size="12" fill="#566473">${f.toFixed(2)} Hz</text>`;});s+='<text x="320" y="280" text-anchor="middle" font-size="18" fill="#263c50">Pitch-class circle</text><text x="320" y="307" text-anchor="middle" font-size="13" fill="#647484">12-TET · A4 = 440 Hz</text>';svg.innerHTML=s;}circle();
const canvas=document.querySelector('#helix'),ctx=canvas.getContext('2d');let az=.45,tilt=.18,drag=null;
function project(t){const a=t*Math.PI/6-Math.PI/2,x=Math.cos(a)*135,z=Math.sin(a)*135,y=(t-18)*11.5;const xx=x*Math.cos(az)+z*Math.sin(az),zz=-x*Math.sin(az)+z*Math.cos(az);return [500+xx*1.8,325-y*Math.cos(tilt)-zz*Math.sin(tilt),zz];}
function drawHelix(){ctx.clearRect(0,0,1000,650);ctx.strokeStyle='#d9e3eb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(500,60);ctx.lineTo(500,590);ctx.stroke();for(let t=0;t<36;t+=.1){const a=project(t),b=project(t+.1);ctx.strokeStyle=a[2]>0?'#497898':'#bdcbd7';ctx.lineWidth=a[2]>0?2.5:1.5;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}const points=Array.from({length:37},(_,i)=>({i,p:project(i)})).sort((a,b)=>a.p[2]-b.p[2]);for(const {i,p} of points){ctx.fillStyle=i%12===0?'#b75962':'#365f7e';ctx.beginPath();ctx.arc(p[0],p[1],i%12===0?5:3,0,Math.PI*2);ctx.fill();ctx.font=i%12===0?'bold 19px sans-serif':'15px sans-serif';ctx.fillStyle=p[2]>0?'#142a3a':'#687b8c';ctx.fillText(names[i%12]+(3+Math.floor(i/12)),p[0]+9,p[1]-5);ctx.font='11px sans-serif';ctx.fillStyle=p[2]>0?'#344c5e':'#617483';ctx.fillText((440*2**((48+i-69)/12)).toFixed(2)+' Hz',p[0]+9,p[1]+10);}}
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;az+=(e.clientX-drag[0])*.012;tilt=Math.max(-.65,Math.min(.65,tilt+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];drawHelix();};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
canvas.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();if(e.key==='ArrowLeft')az-=.12;if(e.key==='ArrowRight')az+=.12;if(e.key==='ArrowUp')tilt=Math.max(-.65,tilt-.05);if(e.key==='ArrowDown')tilt=Math.min(.65,tilt+.05);drawHelix();};document.querySelector('#reset-view').onclick=()=>{az=.45;tilt=.18;drawHelix();};drawHelix();
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('.toc a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));}},{rootMargin:'-10% 0px -70% 0px'});document.querySelectorAll('section').forEach(s=>observer.observe(s));
