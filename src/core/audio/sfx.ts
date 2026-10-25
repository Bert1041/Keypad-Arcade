import type { SoundEffects } from '@/games/types';
import { getSettings } from '@/core/settings/settings';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  // Mobile browsers start the context suspended until a user gesture.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** The single place sound output is gated on the user's setting. */
export function createSfx(
  isEnabled: () => boolean = () => getSettings().soundEnabled,
): SoundEffects {
  return {
    blip(frequencyHz, durationMs = 80) {
      if (!isEnabled()) return;
      const audio = context();
      if (!audio) return;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = frequencyHz;
      const t = audio.currentTime;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + durationMs / 1000);
    },
  };
}
