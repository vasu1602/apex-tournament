// Sound system fully disabled per user request
class SoundFX {
  constructor() {
    this.isMuted = true;
  }
  toggleMute() {
    return true;
  }
  play() {
    // Silent no-op
  }
  stopAll() {
    // Silent no-op
  }
}

export const soundFX = new SoundFX();
if (typeof window !== 'undefined') {
  window.soundFX = soundFX;
}
