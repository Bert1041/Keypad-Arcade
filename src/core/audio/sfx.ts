import type { SoundEffects } from '@/games/types';
import { getSettings } from '@/core/settings/settings';

let ctx: AudioContext | null = null;
let resuming = false;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  // Browsers start the context suspended until a user gesture. Ask once at a time, and expect
  // refusals: Firefox rejects a pending resume when the page navigates away.
  if (ctx.state === 'suspended' && !resuming) {
    resuming = true;
    ctx
      .resume()
      .catch(() => undefined)
      .finally(() => {
        resuming = false;
      });
  }
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
