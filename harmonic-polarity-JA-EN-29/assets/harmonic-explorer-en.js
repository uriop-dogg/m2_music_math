'use strict';
(() => {
  const host = document.querySelector('[data-harmonic-explorer]');
  if (!host) return;
  const bars = [...host.querySelectorAll('[data-harmonic]')];
  const status = host.querySelector('[data-status]');
  const volume = host.querySelector('[data-volume]');
  const root = 440 * Math.pow(2, -21 / 12); // C3, A4 = 440 Hz
  const selected = new Set();
  let context, master, bank = [], pending;
  function render() {
    bars.forEach(button => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.harmonic)))));
    status.textContent = selected.size ? 'Playing harmonics: ' + [...selected].sort((a,b)=>a-b).join(', ') : 'Stopped';
  }
  function reconcile() {
    if (!context || context.state !== 'running' || !selected.size) return;
    if (!bank.length) {
      master = context.createGain();
      // Fixed headroom: 0.24 * sum(1/n, n=1..16) < 0.82.
      master.gain.value = Number(volume.value) * .24;
      master.connect(context.destination);
      const start = context.currentTime + .015;
      bank = bars.map((_, i) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = root * (i + 1);
        gain.gain.value = 0;
        oscillator.connect(gain); gain.connect(master); oscillator.start(start);
        return {oscillator, gain};
      });
    }
    bank.forEach(({gain}, i) => {
      gain.gain.setTargetAtTime(selected.has(i + 1) ? 1 / (i + 1) : 0, context.currentTime, .025);
    });
  }
  async function play() {
    render();
    try {
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('unsupported');
        context = new AudioContext();
      }
      if (context.state !== 'running') {
        if (!pending) pending = context.resume().finally(() => { pending = null; });
        await pending;
      }
      // Re-read the desired notes after resume; a stop during resume wins.
      reconcile();
    } catch (_) {
      stop(); status.textContent = 'Could not start audio. Please try again.';
    }
  }
  function stop() {
    selected.clear();
    if (bank.length) {
      const oldMaster = master;
      const end = context.currentTime + .12;
      oldMaster.gain.setTargetAtTime(0, context.currentTime, .015);
      bank.forEach(({oscillator,gain}) => {
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.stop(end);
      });
      setTimeout(() => oldMaster.disconnect(), 200);
      bank = []; master = null;
    }
    render();
  }
  bars.forEach(button => button.addEventListener('click', () => {
    const n = Number(button.dataset.harmonic), wasSelected = selected.has(n);
    if (wasSelected) selected.delete(n); else selected.add(n);
    if (!selected.size) stop(); else play();
  }));
  host.querySelector('[data-all]').addEventListener('click', () => {
    bars.forEach((_,i)=>selected.add(i+1)); play();
  });
  host.querySelector('[data-stop]').addEventListener('click', stop);
  volume.addEventListener('input', () => {
    if (master) master.gain.setTargetAtTime(Number(volume.value) * .24, context.currentTime, .02);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  render();
})();
