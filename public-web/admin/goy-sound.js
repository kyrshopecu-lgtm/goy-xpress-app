(() => {
  const SOUND_URL = '/assets/goy-xpress-event.mp3?v=2';
  const POLL_MS = 10000;
  let audio = null;
  let unlocked = false;
  let baseline = null;
  let polling = false;

  function getAudio() {
    if (!audio) {
      audio = new Audio(SOUND_URL);
      audio.preload = 'auto';
      audio.volume = 1;
      audio.load();
    }
    return audio;
  }

  async function unlockAudio() {
    if (unlocked) return;
    const player = getAudio();
    const oldVolume = player.volume;
    try {
      player.volume = 0;
      await player.play();
      player.pause();
      player.currentTime = 0;
      unlocked = true;
    } catch {}
    player.volume = oldVolume;
  }

  async function playGoySound() {
    const player = getAudio();
    try {
      player.pause();
      player.currentTime = 0;
      player.volume = 1;
      await player.play();
    } catch (error) {
      console.warn('GOY XPRESS: el navegador bloqueó el sonido hasta que el usuario interactúe con la página.', error);
    }
  }

  function eventKey(item) {
    return String(item?.code || item?.id || '').trim();
  }

  async function pollEvents() {
    if (polling || document.visibilityState === 'hidden') return;
    const token = sessionStorage.getItem('goyAdminToken') || '';
    if (!token) { baseline = null; return; }
    polling = true;
    try {
      const response = await fetch('/api/admin/event-state', {
        headers:{Authorization:`Bearer ${token}`},
        cache:'no-store',
      });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      const events = Array.isArray(body.events) ? body.events : [];
      const next = new Map(events.map(item => [eventKey(item), item]).filter(([key]) => key));

      if (baseline) {
        let shouldPlay = false;
        for (const [key, item] of next) {
          const previous = baseline.get(key);
          if (!previous && item.adminCreated !== true) shouldPlay = true;
          if (previous && String(previous.status || '') !== 'Entrega finalizada' && String(item.status || '') === 'Entrega finalizada') shouldPlay = true;
        }
        if (shouldPlay) playGoySound();
      }
      baseline = next;
    } catch (error) {
      console.warn('GOY XPRESS admin event monitor', error?.message || error);
    } finally {
      polling = false;
    }
  }

  document.addEventListener('pointerdown', unlockAudio, {once:true, passive:true});
  document.addEventListener('keydown', unlockAudio, {once:true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollEvents();
  });

  window.GOY_SOUND = {play:playGoySound, preload:getAudio, poll:pollEvents};
  getAudio();
  setTimeout(pollEvents, 1500);
  setInterval(pollEvents, POLL_MS);
})();
