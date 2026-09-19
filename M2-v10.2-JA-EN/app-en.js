'use strict';
(() => {
  const C = 440 * 2 ** (-9 / 12), $ = id => document.getElementById(id);
  const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  const scaleNames = ['C','D','E','F','G','A','B'];
  const hm = [1,9/8,5/4,21/16,3/2,27/16,15/8];
  const ratios = ['1','9/8','5/4','21/16','3/2','27/16','15/8'];
  const ji = ['1','9/8','5/4','4/3','3/2','5/3','15/8'];
  const oddNumbers = [1,9,5,21,3,27,15], steps = [0,2,4,5,7,9,11];
  const mod = x => ((x % 1) + 1) % 1;
  let pendingButton=null,activeButton=null,activePanel=null;
  const panelFor=new WeakMap(),labels=new WeakMap();
  const controls=[...document.querySelectorAll('[data-audio],#rise-play,#instrument-toggle,[data-table-chord],[data-ratio]')];
  function registerPanel(button) {
    const panel=$('site-waveform');panelFor.set(button,panel);return panel;
  }
  for(const button of controls) {
    labels.set(button,button.innerHTML);button.setAttribute('aria-pressed','false');
    if(!button.dataset.ratio)registerPanel(button);
  }
  function resetUI(message) {
    if(activeButton){activeButton.innerHTML=labels.get(activeButton);activeButton.classList.remove('playing');activeButton.setAttribute('aria-pressed','false');}
    if(activePanel){activePanel.classList.remove('is-playing');activePanel.querySelector('.wave-trace').setAttribute('d','M 0 56 H 640');activePanel.querySelector('.wave-state').textContent=message;}
    activeButton=null;activePanel=null;
    clearInstrumentUI();
    spectrum('harmonic-bars',0,false);spectrum('odd-bars',0,true);
  }
  const engine=new AMTAudioEngine(window.AMT_AUDIO_ASSETS,event=>{
    const messages={loading:'Preparing audio',playing:'Playing',stopped:'Stopped',ended:'Finished',error:'Could not start audio. Please try again.'};
    if(event.state==='loading') {
      activeButton=pendingButton;activePanel=panelFor.get(activeButton);
      activeButton.classList.add('playing');activeButton.setAttribute('aria-pressed','true');
      activeButton.setAttribute('aria-busy','true');
    } else if(event.state==='playing') {
      activeButton.removeAttribute('aria-busy');if(!activeButton.dataset.ratio)activeButton.innerHTML='■ '+labels.get(activeButton).replace(/^\s*▶\s*/,'');
      activePanel.classList.add('is-playing');
    } else {
      activeButton?.removeAttribute('aria-busy');resetUI(messages[event.state]);
    }
    if(activePanel)activePanel.querySelector('.wave-state').textContent=messages[event.state];
    $('audio-status').textContent=messages[event.state];
  });
  engine.setVolume(+$('volume').value);
  function frame(key,kind,{time,data,sampleRate,duration}) {
    if(activePanel) {
      // Keep the root-based time window steady while melody notes change.
      let hz=C,reference='C4';
      if(key==='g-series'||(key==='g-to-c'&&time<2.135)){hz=C*.75;reference='G3';}
      else if((key==='difference-reference'||key==='difference-triangle')){hz=C/4;reference='C2';}
      else if(kind==='rise'||key==='harmonics-layered'||key==='odd-layered'||key.endsWith('-drone')){hz=C/2;reference='C3';}
      const count=Math.min(data.length-2,Math.max(24,Math.round(sampleRate*2/hz)));
      let start=data.length-count-1;
      // Trigger on a rising zero crossing to keep periodic shapes steady.
      for(let i=Math.max(1,start-Math.ceil(sampleRate/hz));i<start;i++)if(data[i-1]<=0&&data[i]>0){start=i;break;}
      let peak=0;for(let i=start;i<start+count;i++)peak=Math.max(peak,Math.abs(data[i]));
      const zoom=peak<.0001?1:Math.min(16,Math.max(1,.9/peak));let path='';
      for(let x=0;x<=640;x+=2){const sample=data[Math.min(data.length-1,start+Math.floor(x/640*(count-1)))];path+=(x?'L':'M')+x+' '+(56-sample*zoom*40).toFixed(2)+' ';}
      activePanel.querySelector('.wave-trace').setAttribute('d',path);
      activePanel.querySelector('.wave-scale').textContent=`Reference ${reference} · ${(count/sampleRate*1000).toFixed(2)} ms · Amplitude ×${zoom.toFixed(1)}`;
      activePanel.querySelector('.wave-state').textContent=duration?`Playing ${Math.min(time,duration).toFixed(1)} / ${duration.toFixed(1)} s`:'Playing · press again to stop';
    }
    if(kind==='odd') {
      const n=1+2*Math.floor(time/AMTAudioEngine.ODD_INTERVAL);
      circle(12*Math.log2(n),'odd-circle',`Odd harmonic ${n}`,`${(C*n/2**Math.floor(Math.log2(n))).toFixed(2)} Hz`);
      $('odd-circle-caption').textContent=`Root C + odd harmonic ${n} (within one octave)`;
    } else if(kind==='rise') {
      const t=time%16.1;
      if(t>=13.3)circle(0,'pitch-circle','C3 · C4 · C5 · C6 · C7','Five octaves together');
      else {const oct=Math.min(4,Math.floor(t/3)),part=t-oct*3;circle(oct*12+(oct<4?Math.max(0,part-1)*6:0),'pitch-circle',null,part<1||oct===4?`Hold C${oct+3}`:'Rising to the next C');}
    } else if(key==='harmonics-layered'||key==='odd-layered') {
      const odd=key==='odd-layered';spectrum(odd?'odd-bars':'harmonic-bars',time,odd,true);
    }
  }
  function file(key,label,button) {
    pendingButton=button;const kind=key==='odd-folded'?'odd':key==='rise'?'rise':'file';
    return engine.start(key,kind,values=>frame(key,kind,values));
  }
  document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>file(button.dataset.audio,'',button)));
  $('rise-play').onclick=()=>file('rise','',$('rise-play'));
  document.querySelectorAll('[data-table-chord]').forEach(button=>button.addEventListener('click',()=>{
    pendingButton=button;const key='table-'+button.dataset.tableChord;
    engine.start(key,'chord',v=>frame(key,'chord',v),{ratios:button.dataset.chordRatios.split(',').map(Number)});
  }));


  $('volume').addEventListener('input',()=>{engine.setVolume(+$('volume').value);$('volume-value').textContent=Math.round(+$('volume').value*100)+'%';});
  window.addEventListener('pagehide',()=>engine.stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.stop();});

  const svg = (tag, attrs, text = '') => `<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${text}</${tag}>`;
  function spectrum(id,time,odd,playing=false) {
    const target=$(id);if(!target)return;
    const ns=Array.from({length:odd?8:16},(_,i)=>odd?2*i+1:i+1);
    let content=svg('line',{x1:45,x2:655,y1:150,y2:150,stroke:'#584167'})+
      svg('line',{x1:45,x2:45,y1:22,y2:150,stroke:'#584167'});
    for(let n=1;n<=16;n++) {
      const index=ns.indexOf(n),since=time-index*.16;
      const end=(ns.length-1)*.16+1.5;
      const level=playing&&index>=0&&since>=0?Math.max(0,Math.min(1,since/.025,(end-time)/.065)):0;
      const x=60+(n-1)*38;
      content+=svg('rect',{x:x-9,y:150-level*105,width:18,height:level*105,rx:3,fill:odd?'#007e9d':'#b62b91'});
      content+=svg('text',{x,y:174,'text-anchor':'middle','font-size':14,fill:'#302040'},n);
    }
    content+=svg('text',{x:12,y:23,'font-size':13,fill:'#302040'},'Level');
    content+=svg('text',{x:652,y:195,'text-anchor':'end','font-size':13,fill:'#302040'},'Harmonic number');
    target.innerHTML=content;
  }
  spectrum('harmonic-bars',0,false);spectrum('odd-bars',0,true);
  function circle(semitones=0,id='pitch-circle',title=null,subtitle='Ascending around the circle') {
    const h=mod(semitones/12), angle=h*Math.PI*2-Math.PI/2;
    const freq=C/2*2**(semitones/12);
    let s=svg('circle',{cx:210,cy:210,r:145,fill:'none',stroke:'#6f619e','stroke-width':2});
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2-Math.PI/2;
      s+=svg('text',{x:210+Math.cos(a)*176,y:216+Math.sin(a)*176,'text-anchor':'middle','font-size':18,fill:'#251b3c'},names[i]);
    }
    s+=svg('line',{x1:210,y1:210,x2:210+Math.cos(angle)*145,y2:210+Math.sin(angle)*145,stroke:'#d72c88','stroke-width':3});
    s+=svg('circle',{cx:210+Math.cos(angle)*145,cy:210+Math.sin(angle)*145,r:8,fill:'#d72c88'});
    s+=svg('text',{x:210,y:208,'text-anchor':'middle','font-size':25,fill:'#251b3c'},title||`${freq.toFixed(1)} Hz`);
    s+=svg('text',{x:210,y:238,'text-anchor':'middle','font-size':13,fill:'#493859'},subtitle);
    $(id).innerHTML=s;
  }
  circle(); circle(0,'odd-circle','Odd harmonic 1','Root C');
  const pitchCircle=$('pitch-circle');let dragPointer=null,dragRatio=1,dragRevision=0;
  pitchCircle.setAttribute('tabindex','0');pitchCircle.setAttribute('role','slider');
  pitchCircle.setAttribute('aria-label','Pitch-class circle. Drag or use left/right arrows to play within the C4 octave');
  pitchCircle.setAttribute('aria-valuemin','0');pitchCircle.setAttribute('aria-valuemax','1200');
  function showDrag(ratio){
    dragRatio=ratio;circle(12+12*Math.log2(ratio),'pitch-circle',`${(C*ratio).toFixed(1)} Hz`,'C4 octave · drag to play');
    pitchCircle.setAttribute('aria-valuenow',String(Math.round(1200*Math.log2(ratio))));
    pitchCircle.setAttribute('aria-valuetext',`${(C*ratio).toFixed(1)} Hz`);engine.setDragRatio(ratio);
  }
  function moveDrag(event){
    const rect=pitchCircle.getBoundingClientRect(),size=Math.min(rect.width,rect.height);
    const x=(event.clientX-rect.left-rect.width/2)/size,y=(event.clientY-rect.top-rect.height/2)/size;
    showDrag(2**mod((Math.atan2(y,x)+Math.PI/2)/(2*Math.PI)));
  }
  async function startDrag(){
    const revision=++dragRevision;pendingButton=$('rise-play');
    await engine.start('circle-drag','drag',v=>frame('circle-drag','drag',v),{ratio:dragRatio});
    if(revision===dragRevision)engine.setDragRatio(dragRatio);
  }
  function endDrag(){dragPointer=null;dragRevision++;pitchCircle.classList.remove('dragging');if(engine.session?.key==='circle-drag')engine.stop();}
  pitchCircle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();dragPointer=event.pointerId;
    pitchCircle.setPointerCapture(event.pointerId);pitchCircle.classList.add('dragging');moveDrag(event);startDrag();
  });
  pitchCircle.addEventListener('pointermove',event=>{if(event.pointerId===dragPointer)moveDrag(event);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])pitchCircle.addEventListener(name,endDrag);
  pitchCircle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
    showDrag(2**mod(Math.log2(dragRatio)+(event.key==='ArrowRight'?1:-1)/120));
    if(engine.session?.kind!=='drag')startDrag();
  });
  pitchCircle.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key))endDrag();});
  pitchCircle.addEventListener('blur',endDrag);

  function plot(id,major) {
    const left=45,width=705,top=30,height=365;let s='';
    for(let i=0;i<=12;i++) {
      const x=left+width*i/12;
      s+=svg('line',{x1:x,x2:x,y1:top,y2:top+height,stroke:'#c6c0d6'});
      s+=svg('text',{x,y:top+height+27,'text-anchor':'middle','font-size':16,fill:'#342945'},names[i%12]);
    }
    for(let n=1;n<=32;n++) {
      const y=top+height*(32-n)/31,x=left+width*mod(Math.log2(n));
      if(n===1||n%4===0)s+=svg('text',{x:30,y:y+5,'text-anchor':'end','font-size':14,fill:'#342945'},n);
      if(major&&!oddNumbers.includes(n))continue;
      s+=svg('circle',{cx:x,cy:y,r:major?5:4,fill:major?'#cf287f':n%2?'#00748d':'#8c70bf'});
      if(major) {
        const i=oddNumbers.indexOf(n),etX=left+width*steps[i]/12,cents=1200*Math.log2(hm[i])-steps[i]*100;
        s+=svg('line',{x1:x,x2:x,y1:top,y2:top+height,stroke:'#cf287f','stroke-dasharray':'3 5'});
        s+=svg('line',{x1:etX,x2:x,y1:y,y2:y,stroke:'#cf287f','stroke-width':2});
        if(Math.abs(x-etX)>1)s+=svg('path',{d:`M ${x+(x>etX?-5:5)} ${y-4} L ${x} ${y} L ${x+(x>etX?-5:5)} ${y+4}`,fill:'none',stroke:'#cf287f'});
        const tx=x>680?x-12:x+12;
        s+=svg('text',{x:tx,y:y-9,'text-anchor':x>680?'end':'start','font-size':15,fill:'#9a1258'},`${scaleNames[i]} · ${n} · ${cents>=0?'+':''}${cents.toFixed(2)} cent`);
      }
    }
    s+=svg('text',{x:45,y:17,'font-size':14,fill:'#342945'},'Number');
    s+=svg('text',{x:750,y:452,'text-anchor':'end','font-size':14,fill:'#342945'},major?'Dashed: H-Major / vertical: 12ET':'Blue: odd / purple: even · pitch class from C →');
    $(id).innerHTML=s;
  }
  plot('plot-all',false);plot('plot-major',true);
  let instrumentReady=null;
  const heldKeys=new Set(),clickedPads=new Set();
  function clearInstrumentUI() {
    heldKeys.clear();clickedPads.clear();
    $('drone-c').checked=false;$('drone-g').checked=false;
    document.querySelectorAll('.note-chip').forEach(b=>{b.classList.remove('sounding','latched');b.setAttribute('aria-pressed','false');});
    $('series-instrument').classList.remove('armed');
  }
  async function ensureInstrument() {
    if(engine.session?.key==='instrument'&&engine.session.bus)return true;
    if(instrumentReady)return instrumentReady;
    pendingButton=$('instrument-toggle');
    instrumentReady=engine.start('instrument','instrument',v=>frame('instrument','instrument',v)).then(()=>{
      const ready=engine.session?.key==='instrument'&&!!engine.session.bus;
      if(ready)$('series-instrument').classList.add('armed');
      return ready;
    }).finally(()=>{instrumentReady=null;});
    return instrumentReady;
  }
  function instrumentItems() {
    return [['C',1],['D',9/8],['E',5/4],['F',21/16],['G',3/2],['A',27/16],...($('include-seven').checked?[['B♭',7/4]]:[]),['B',15/8],['C↑',2]];
  }
  function syncPad(index) {
    const on=heldKeys.has(index)||clickedPads.has(index),item=instrumentItems()[index];
    if(!item)return;
    const id='pad-'+index;
    if(on&&!engine.session?.voices.has(id))engine.instrumentNote(id,C*item[1],true);
    if(!on)engine.releaseNote(id);
    const pad=$('series-notes').querySelector(`[data-note-index="${index}"]`);
    if(pad){pad.classList.toggle('sounding',on);pad.classList.toggle('latched',clickedPads.has(index));pad.setAttribute('aria-pressed',String(clickedPads.has(index)));}
  }
  async function playPad(index) {
    if(!await ensureInstrument())return;
    syncPad(index);
  }
  function togglePad(index) {
    // Start may clear a previous playback's state synchronously, before the new latch.
    const ready=ensureInstrument();
    if(clickedPads.has(index))clickedPads.delete(index);else clickedPads.add(index);
    ready.then(ok=>{if(ok)syncPad(index);});
  }
  function releaseKeys() {
    const indices=[...heldKeys];heldKeys.clear();for(const index of indices)syncPad(index);
  }
  function releaseAllPads() {
    const indices=new Set([...heldKeys,...clickedPads]);heldKeys.clear();clickedPads.clear();for(const index of indices)syncPad(index);
  }
  const instrument=$('series-instrument');
  instrument.addEventListener('click',event=>{
    if(event.target.closest('#instrument-toggle,[data-audio],input,label'))return;
    if(!event.target.closest('button,input,label'))instrument.focus({preventScroll:true});
    ensureInstrument();
  });
  instrument.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||!/^\d$/.test(event.key))return;
    const index=Number(event.key)-1;
    if(index<0||index>=instrumentItems().length)return;
    event.preventDefault();if(event.repeat||heldKeys.has(index))return;
    ensureInstrument();heldKeys.add(index);playPad(index,true);
  });
  instrument.addEventListener('keyup',event=>{
    const index=Number(event.key)-1;
    if(!heldKeys.has(index))return;
    event.preventDefault();heldKeys.delete(index);syncPad(index);
  });
  instrument.addEventListener('focusout',event=>{if(!instrument.contains(event.relatedTarget))releaseKeys();});
  window.addEventListener('blur',releaseKeys);
  $('instrument-toggle').onclick=()=>{
    if(engine.session?.key==='instrument')engine.stop();else ensureInstrument();
  };
  const droneRevisions={};
  for(const [id,ratio] of [['drone-c',.5],['drone-g',.75]]) {
    $(id).addEventListener('change',async()=>{
      const checked=$(id).checked,revision=(droneRevisions[id]||0)+1;droneRevisions[id]=revision;
      if(checked) {if(await ensureInstrument()&&droneRevisions[id]===revision){ $(id).checked=true;engine.instrumentNote(id,C*ratio,true); }}
      else engine.releaseNote(id);
    });
  }
  let hoveredRatio=null;
  function playRatio(button,index) {
    if(engine.ctx?.state!=='running') {
      $('enable-audio').hidden=false;
      $('audio-status').textContent='Click the page once, then hover over ratios to listen.';
      $('site-waveform').querySelector('.wave-state').textContent='Click to enable audio';return;
    }
    const parts=button.dataset.ratio.split('/').map(Number),raw=parts[0]/(parts[1]||1);
    const tableRatio=Number(button.dataset.playRatio);
    const value=tableRatio>0?tableRatio:raw,key='ratio-'+index;
    if(engine.session?.key===key)return;
    registerPanel(button);pendingButton=button;
    button.title=tableRatio>0?`Same pitch as table playback · ${(C*value).toFixed(2)} Hz`:`C4 × ${button.dataset.ratio} · ${(C*value).toFixed(2)} Hz`;
    return engine.start(key,'tone',v=>frame('ratio','tone',v),{ratio:value,attack:tableRatio>0?.16:.02});
  }
  async function unlockAudio() {
    try {await engine.context();if(engine.ctx.state==='running') {
      $('enable-audio').hidden=true;
      if(hoveredRatio)playRatio(hoveredRatio.button,hoveredRatio.index);
      else if(!engine.session)$('site-waveform').querySelector('.wave-state').textContent='Audio ready';
    }}catch(_){$('audio-status').textContent='Could not enable audio. Please try again.';}
  }
  document.addEventListener('pointerdown',unlockAudio,{capture:true});
  document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')unlockAudio();},{capture:true});
  $('enable-audio').onclick=unlockAudio;
  document.querySelectorAll('[data-ratio]').forEach((button,index)=>{
    button.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;hoveredRatio={button,index};playRatio(button,index);});
    button.addEventListener('pointerleave',()=>{
      if(hoveredRatio?.button===button)hoveredRatio=null;
      if(engine.session?.key==='ratio-'+index)engine.stop();
    });
    button.addEventListener('click',async()=>{await unlockAudio();playRatio(button,index);});
  });
  $('volume-toggle').onclick=()=>{
    const open=$('volume-panel').hidden;$('volume-panel').hidden=!open;$('volume-toggle').setAttribute('aria-expanded',String(open));
  };
  document.addEventListener('click',event=>{if(!event.target.closest('.audio-dock')){$('volume-panel').hidden=true;$('volume-toggle').setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('volume-panel').hidden=true;$('volume-toggle').setAttribute('aria-expanded','false');}});

  function series() {
    releaseAllPads();
    const seven=$('include-seven').checked;
    const items=[['C',1,true,null],['D',9,true,3],['E',5,true,null],['F',21,false,7],['G',3,true,1],['A',27,false,9],...(seven?[['B♭',7,true,null]]:[]),['B',15,false,5],['C↑',1,true,null]];
    $('series-notes').innerHTML=items.map(([name,q,c,g],i)=>`<button type="button" aria-pressed="false" class="note-chip ${c?'c':''} ${g?'g':''}" data-note-index="${i}" aria-label="Play ${name}, number key ${i+1}"><kbd>${i+1}</kbd><strong>${name}</strong><small>${q}</small></button>`).join('');
    $('series-notes').querySelectorAll('[data-note-index]').forEach(button=>button.addEventListener('click',()=>togglePad(Number(button.dataset.noteIndex))));
    $('series-detail').innerHTML=`<div class="table-wrap"><table><caption>Series membership (— is outside harmonics 1–9)</caption><tr><th>Note</th>${items.map(x=>`<th>${x[0]}</th>`).join('')}</tr><tr><th class="c-color">C: low harmonics</th>${items.map(x=>`<td>${x[2]?x[1]:'—'}</td>`).join('')}</tr><tr><th class="g-color">G: low harmonics</th>${items.map(x=>`<td>${x[3]||'—'}</td>`).join('')}</tr></table></div>`;
  }
  $('include-seven').addEventListener('change',series);series();
  if(window.matchMedia('(max-width:720px)').matches) document.querySelector('.toc details').open=false;
})();
