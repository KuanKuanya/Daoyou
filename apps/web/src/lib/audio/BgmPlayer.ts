import type { BgmTrack } from './bgm';

export type BgmStatus =
  'off' | 'paused' | 'loading' | 'playing' | 'blocked' | 'error';
type Channel = {
  audio: HTMLAudioElement;
  gain: GainNode;
  track?: BgmTrack;
  timer?: ReturnType<typeof setTimeout>;
};

/** One game-lifetime player, with two streaming channels for scene crossfades. */
export class BgmPlayer {
  private context?: AudioContext;
  private channels: Channel[] = [];
  private current = 0;
  private revision = 0;
  private unlocked = false;
  private disposed = false;
  private enabled = false;
  private foreground = false;
  private volume = 0.25;
  private track?: BgmTrack;

  constructor(
    private readonly host: HTMLElement,
    private readonly notify: (status: BgmStatus) => void,
  ) {}

  configure(enabled: boolean, foreground: boolean, track?: BgmTrack) {
    if (
      this.enabled === enabled &&
      this.foreground === foreground &&
      this.track?.id === track?.id &&
      this.track?.src === track?.src &&
      this.track?.gain === track?.gain
    )
      return;
    this.enabled = enabled;
    this.foreground = foreground;
    this.track = track;
    this.revision += 1;
    this.reconcile();
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.context && this.channels.length) {
      const channel = this.channels[this.current];
      this.fade(channel, volume * (channel.track?.gain ?? 1), 0.08);
    }
    if (volume === 0) this.reconcile();
    else if (this.channels.every((channel) => channel.audio.paused))
      this.reconcile();
  }

  activate() {
    if (this.disposed || !this.enabled || !this.foreground || this.volume === 0)
      return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.channels = Array.from({ length: 2 }, () => {
          const audio = new Audio();
          audio.preload = 'none';
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          this.host.append(audio);
          const gain = this.context!.createGain();
          gain.gain.value = 0;
          this.context!.createMediaElementSource(audio).connect(gain);
          gain.connect(this.context!.destination);
          const channel: Channel = { audio, gain };
          audio.addEventListener('error', () => {
            if (
              !this.disposed &&
              channel.track?.id === this.track?.id &&
              this.enabled &&
              this.foreground
            ) {
              this.pause();
              this.notify('error');
            }
          });
          return channel;
        });
      }
      // Both operations start inside the gesture, before awaiting either promise.
      const resume = this.context.resume();
      this.unlocked = true;
      this.reconcile();
      const revision = this.revision;
      void resume.catch(() => {
        if (!this.disposed && revision === this.revision) {
          this.pause();
          this.unlocked = false;
          this.notify('blocked');
        }
      });
    } catch {
      this.notify('error');
    }
  }

  private clearTimer(channel: Channel) {
    clearTimeout(channel.timer);
    channel.timer = undefined;
  }

  private fade(channel: Channel, value: number, seconds: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const gain = channel.gain.gain;
    const current = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
    gain.linearRampToValueAtTime(value, now + seconds);
  }

  private pause() {
    this.revision += 1;
    for (const channel of this.channels) {
      this.clearTimer(channel);
      channel.audio.pause();
      this.fade(channel, 0, 0);
    }
  }

  private reconcile() {
    if (this.disposed) return;
    if (!this.enabled || !this.foreground || this.volume === 0) {
      this.pause();
      this.notify(this.enabled ? 'paused' : 'off');
      return;
    }
    if (!this.track) {
      this.pause();
      this.notify('error');
      return;
    }
    if (!this.unlocked || !this.context) {
      this.notify('blocked');
      return;
    }
    const current = this.channels[this.current];
    const sameTrack =
      current.track?.id === this.track.id &&
      current.track?.src === this.track.src;
    if (sameTrack && !current.audio.paused) {
      current.track = this.track;
      this.fade(current, this.volume * this.track.gain, 0.08);
      const other = this.channels[1 - this.current];
      // Cancel a pending switch if navigation returns to the current track.
      if (!other.timer) {
        other.audio.pause();
        this.fade(other, 0, 0);
      }
      return;
    }

    const revision = ++this.revision;
    const index = sameTrack ? this.current : 1 - this.current;
    const next = this.channels[index];
    this.clearTimer(next);
    if (next.track?.id !== this.track.id || next.track.src !== this.track.src) {
      next.audio.pause();
      next.track = this.track;
      next.audio.src = this.track.src;
      this.fade(next, 0, 0);
    }
    this.notify('loading');
    if (next.audio.error) next.audio.load();
    void Promise.all([this.context.resume(), next.audio.play()])
      .then(() => {
        if (this.disposed || revision !== this.revision) return;
        this.current = index;
        this.fade(next, this.volume * (next.track?.gain ?? 1), 1.5);
        if (current !== next) {
          this.fade(current, 0, 1.5);
          this.clearTimer(current);
          current.timer = setTimeout(() => current.audio.pause(), 1500);
        }
        this.notify('playing');
      })
      .catch((error: unknown) => {
        if (this.disposed || revision !== this.revision) return;
        this.pause();
        const blocked =
          error instanceof DOMException && error.name === 'NotAllowedError';
        if (blocked) this.unlocked = false;
        this.notify(blocked ? 'blocked' : 'error');
      });
  }

  dispose() {
    this.disposed = true;
    this.pause();
    for (const channel of this.channels) {
      channel.audio.removeAttribute('src');
      channel.audio.load();
      channel.audio.remove();
      channel.gain.disconnect();
    }
    void this.context?.close().catch(() => undefined);
  }
}
