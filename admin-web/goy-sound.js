(() => {
  const SOUND_URL = '/api/goy-notification-sound?v=1';
  let audio = null;
  let unlocked = false;

  function fallbackSpeech() {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('GOY, goy, goy');
      utterance.lang = 'es-EC';
      utterance.rate = 1.35;
      utterance.pitch = 1.08;
      utterance.volume = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

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
      console.warn('GOY generated notification unavailable; using browser voice fallback.', error);
      fallbackSpeech();
    }
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

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
