'use strict';
// Keep the reader at the corresponding section when switching languages.
document.querySelectorAll('a.language-switch').forEach(link => {
  link.addEventListener('click', () => {
    const sections = [...document.querySelectorAll('main > section[id]')];
    let id = 'intro';
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= window.innerHeight * .45) id = section.id;
    }
    const target = new URL(link.getAttribute('href'), window.location.href);
    target.hash = id;
    link.href = target.href;
  });
});
