(() => {
  const SOUND_URL = '/api/goy-notification-sound?v=1';
  let audio = null;
  let unlocked = false;

  function getAudio() {
    if (!audio) {
      audio = new Audio(SOUND_URL);
      audio.preload = 'auto';
      audio.volume = 0.9;
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
      player.volume = 0.9;
      await player.play();
    } catch (error) {
      console.warn('GOY notification sound was blocked by the browser', error);
    }
  }

  // Prepara el audio en la primera interacción del administrador para cumplir
  // las políticas de reproducción automática de navegadores móviles.
  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  // Observa las respuestas de creación de órdenes sin modificar la lógica existente.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const input = args[0];
      const options = args[1] || {};
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const method = String(options.method || input?.method || 'GET').toUpperCase();
      if (response.ok && method === 'POST' && url.includes('/api/admin-create-request')) {
        playGoySound();
      }
    } catch {}
    return response;
  };

  window.GOY_SOUND = { play: playGoySound, preload: getAudio };
  getAudio();
})();
