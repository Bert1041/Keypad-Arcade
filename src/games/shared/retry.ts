/**
 * When a finished run may be restarted: only by a press that *starts* after the run ended (and
 * after a short delay) — never by lifting a finger that was still down from play, or by a key
 * held through the end (auto-repeat). Otherwise a player who dies mid-drag lifts their thumb and
 * the game restarts before they have seen their score or the share button.
 */
export class RetryGate {
  private endedAt = Number.POSITIVE_INFINITY;
  private armed = false;

  constructor(private readonly delayMs: number) {}

  /** The run ended at `now`. */
  end(now: number): void {
    this.endedAt = now;
    this.armed = false;
  }

  /** A pointer went down: a fresh press, after the delay, arms a restart on release. */
  press(now: number): void {
    this.armed = now - this.endedAt >= this.delayMs;
  }

  /** A pointer came up: true if this completes a fresh press. */
  release(): boolean {
    const go = this.armed;
    this.armed = false;
    return go;
  }

  /** A restart key (Space, Enter): true for a fresh press after the delay, not auto-repeat. */
  key(now: number, repeat: boolean): boolean {
    return !repeat && now - this.endedAt >= this.delayMs;
  }
}
