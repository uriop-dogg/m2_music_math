'use strict';
// Reading navigation and equation fitting. Audio lives in harmonic-explorer.js.
(() => {
  // Measure the rendered math, rather than reserving max-content width for
  // every equation. Short expressions keep the normal size; only long ones shrink.
  function fitEquations(){
    document.querySelectorAll('.equation-centered>math,.display-equation>math').forEach(math=>{
      math.style.removeProperty('font-size');
      const host=math.parentElement,css=getComputedStyle(host);
      const available=host.clientWidth-parseFloat(css.paddingLeft||0)-parseFloat(css.paddingRight||0)-2;
      if(available<=0)return;
      let size=parseFloat(getComputedStyle(math).fontSize);
      for(let pass=0;pass<3;pass++){
        const width=math.getBoundingClientRect().width;
        if(width<=available||width<=0)break;
        size*=available/width;
        math.style.setProperty('font-size',size.toFixed(3)+'px','important');
      }
    });
  }
  let scheduled=false;
  function scheduleFit(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;fitEquations();});}
  scheduleFit();window.addEventListener('resize',scheduleFit);
  document.fonts?.ready.then(scheduleFit);
  window.addEventListener('beforeprint',fitEquations);
  window.addEventListener('afterprint',scheduleFit);
  if('ResizeObserver'in window){
    let previousWidth=0;
    const widthObserver=new ResizeObserver(entries=>{
      const width=entries[0].contentRect.width;
      if(Math.abs(width-previousWidth)>.5){previousWidth=width;scheduleFit();}
    });
    const main=document.getElementById('main');if(main)widthObserver.observe(main);
  }
  const toc=document.querySelector('.toc details');
  if(toc&&window.matchMedia('(max-width:640px)').matches)toc.open=false;
  const links=[...document.querySelectorAll('.toc a')];
  if(!('IntersectionObserver'in window))return;
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
    if(!visible.length)return;
    const id=visible[0].target.id;
    for(const link of links){const active=link.getAttribute('href')==='#'+id;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
  },{rootMargin:'-5% 0px -65% 0px',threshold:0});
  document.querySelectorAll('#intro,main section').forEach(section=>observer.observe(section));
})();
