'use strict';
(() => {
  for(const link of document.querySelectorAll('[data-language-switch]')){
    link.addEventListener('click',()=>{
      // Keep the reading position at a section or graph shared by both languages.
      const targets=[...document.querySelectorAll('main section[id],main figure[id]')];
      let nearest=null;
      for(const target of targets){if(target.getBoundingClientRect().top<=120)nearest=target;}
      const id=nearest?.id||'intro';
      const url=new URL(link.href,document.baseURI);url.hash=id;link.href=url.href;
    });
  }
})();
