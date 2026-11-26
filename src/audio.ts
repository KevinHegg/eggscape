/**
 * Every sound in the game, made on the spot from oscillators and noise. No files to fetch.
 * Presentation only: nothing here is read by the simulation.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rumble: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: GainNode | null = null;
  muted = false;

  /** Browsers only let sound start from a tap. Call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.ratio.value = 6;
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.9;
      this.out.connect(squash).connect(ctx.destination);
      const length = ctx.sampleRate * 1.5;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      // The view's own dice again: a fixed hiss, the same every time.
      let seed = 22222;
      for (let index = 0; index < length; index += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[index] = seed / 2147483648 - 1;
      }
      this.rumble = this.loop("lowpass", 90);
      this.wind = this.loop("bandpass", 900).gain;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  private loop(type: BiquadFilterType, frequency: number): { gain: GainNode; filter: BiquadFilterNode } {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.out!);
    source.start();
    return { gain, filter };
  }

  /** The cart's own noise: wheels on cobbles while it rolls, wind while it flies. */
  roll(speed: number, grounded: boolean, running: boolean): void {
    if (!this.ctx || !this.rumble || !this.wind) return;
    const now = this.ctx.currentTime;
    const pace = Math.min(1, speed / 22);
    this.rumble.gain.gain.setTargetAtTime(running && grounded ? 0.1 + pace * 0.34 : 0, now, 0.06);
    this.rumble.filter.frequency.setTargetAtTime(70 + pace * 150, now, 0.1);
    this.wind.gain.setTargetAtTime(running ? (grounded ? pace * 0.03 : 0.1 + pace * 0.12) : 0, now, 0.12);
  }

  private tone(type: OscillatorType, from: number, to: number, length: number, volume: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(this.out);
    osc.start(start);
    osc.stop(start + length + 0.03);
  }

  private hiss(type: BiquadFilterType, from: number, to: number, length: number, volume: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.noise) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter).connect(gain).connect(this.out);
    source.start(start, (start * 0.37) % 1);
    source.stop(start + length + 0.03);
  }

  /** The cart's gun. */
  cannon(): void {
    this.tone("sine", 190, 42, 0.32, 0.9);
    this.hiss("lowpass", 2600, 200, 0.28, 0.7);
  }

  /** A round arriving: a tower or a wall coming apart. */
  bang(big = false): void {
    this.tone("sine", big ? 120 : 150, 28, big ? 0.9 : 0.5, 1);
    this.hiss("lowpass", big ? 1800 : 2400, 90, big ? 1.1 : 0.6, big ? 1 : 0.8);
    this.rubble(big ? 9 : 5, 0.12);
  }

  /** Stones and timbers coming down. */
  rubble(count: number, delay = 0): void {
    for (let index = 0; index < count; index += 1) {
      this.hiss("bandpass", 300 + ((index * 137) % 500), 160, 0.09, 0.35, delay + index * 0.07 + ((index * 53) % 40) / 1000);
    }
  }

  /** A far bombard's shot landing in a field; quieter the further off. */
  thud(distance: number): void {
    const volume = Math.max(0.06, 0.55 - distance / 60);
    this.tone("sine", 90, 34, 0.3, volume);
    this.hiss("lowpass", 700, 100, 0.3, volume * 0.7);
  }

  crack(hard: boolean): void {
    this.hiss("highpass", 5200, 2400, hard ? 0.16 : 0.07, hard ? 0.7 : 0.4);
    this.tone("square", hard ? 1400 : 1900, 500, 0.05, 0.16);
  }

  bump(amount: number): void {
    this.tone("sine", 110, 48, 0.14, Math.min(0.7, 0.15 + amount / 30));
    this.hiss("lowpass", 900, 200, 0.1, Math.min(0.5, 0.1 + amount / 40));
  }

  swat(hit: boolean): void {
    this.hiss("bandpass", 1500, 500, 0.13, 0.5);
    if (hit) {
      this.tone("triangle", 260, 85, 0.16, 0.8);
      this.tone("square", 760, 380, 0.07, 0.2);
    }
  }

  clang(): void {
    this.tone("square", 1180, 1160, 0.38, 0.14);
    this.tone("sine", 1764, 1750, 0.5, 0.26);
    this.tone("sine", 2640, 2600, 0.3, 0.14);
    this.hiss("highpass", 4200, 3000, 0.05, 0.3);
  }

  /** The shield going up: a rising shimmer. */
  shield(): void {
    this.tone("sine", 440, 880, 0.2, 0.3);
    this.tone("triangle", 660, 1320, 0.26, 0.2, 0.04);
  }

  twang(): void {
    for (let index = 0; index < 4; index += 1) this.tone("sawtooth", 520 - index * 40, 180, 0.11, 0.14, index * 0.035);
    this.hiss("highpass", 3600, 1800, 0.22, 0.2, 0.05);
  }

  windup(): void {
    this.tone("sawtooth", 70, 150, 0.7, 0.12);
    this.hiss("bandpass", 320, 620, 0.7, 0.14);
  }

  whoosh(): void {
    this.hiss("bandpass", 280, 2800, 0.5, 0.75);
    this.tone("sawtooth", 80, 240, 0.45, 0.2);
  }

  hop(): void {
    this.tone("triangle", 180, 620, 0.2, 0.4);
    this.hiss("bandpass", 600, 1800, 0.18, 0.3);
  }

  smash(): void {
    this.tone("square", 150, 60, 0.14, 0.3);
    this.hiss("lowpass", 1400, 300, 0.16, 0.5);
  }

  brace(): void {
    this.tone("sawtooth", 240, 150, 0.2, 0.2);
    this.hiss("bandpass", 900, 500, 0.2, 0.25);
  }

  /** The brake shoe going on: wood on an iron tyre. */
  brake(): void {
    this.hiss("bandpass", 2400, 1500, 0.35, 0.3);
    this.tone("sawtooth", 620, 540, 0.3, 0.08);
  }

  splinter(): void {
    this.hiss("bandpass", 1300, 400, 0.12, 0.4);
  }

  /** Something gained: two notes up. Munitions sound heavier than hay. */
  pickup(heavy: boolean): void {
    const base = heavy ? 392 : 523;
    this.tone("triangle", base, base, 0.1, 0.4);
    this.tone("triangle", base * 1.5, base * 1.5, 0.18, 0.4, 0.09);
    if (heavy) this.tone("square", 150, 110, 0.1, 0.2, 0.02);
  }

  /** The gun has nothing to fire, or nothing to fire at. */
  click(): void {
    this.tone("square", 900, 600, 0.04, 0.2);
  }

  lost(): void {
    this.tone("sawtooth", 520, 180, 0.4, 0.22);
  }

  /** Big air: a rising whistle. */
  air(): void {
    this.tone("sine", 500, 1300, 0.45, 0.16);
  }

  /** He's scrambled. */
  splat(): void {
    this.crack(true);
    this.tone("sine", 300, 50, 0.5, 0.6, 0.05);
    this.hiss("lowpass", 900, 120, 0.5, 0.6, 0.05);
    for (const [note, at] of [[392, 0.5], [370, 0.72], [349, 0.94], [262, 1.16]] as const) this.tone("triangle", note, note * 0.98, 0.3, 0.3, at);
  }

  /** The sling let go: a whip of air. */
  sling(): void {
    this.hiss("bandpass", 900, 3200, 0.09, 0.35);
    this.tone("triangle", 320, 520, 0.06, 0.12);
  }

  /** Hens with opinions. */
  cluck(): void {
    for (const [at, pitch] of [[0, 480], [0.09, 520], [0.2, 460], [0.3, 560], [0.44, 500]] as const) this.tone("sawtooth", pitch, pitch * 0.7, 0.07, 0.16, at);
    this.tone("sawtooth", 560, 900, 0.14, 0.2, 0.56);
  }

  /** The great bell, struck: harder is louder and longer. */
  toll(hard: number): void {
    const loud = Math.max(0.25, Math.min(1, hard));
    this.tone("sine", 196, 194, 1.6 * loud + 0.5, 0.7 * loud);
    this.tone("sine", 392, 389, 1.1 * loud + 0.4, 0.34 * loud);
    this.tone("sine", 523, 518, 0.8 * loud + 0.3, 0.2 * loud);
    this.tone("square", 990, 970, 0.12, 0.1 * loud);
    this.hiss("bandpass", 2200, 1200, 0.06, 0.4 * loud);
  }

  /** A tower making up its mind: timber and stone complaining. */
  groan(): void {
    this.tone("sawtooth", 62, 44, 1.5, 0.3);
    this.tone("sawtooth", 93, 58, 1.3, 0.16, 0.2);
    this.hiss("bandpass", 420, 180, 1.4, 0.3);
    this.rubble(6, 0.5);
  }

  /** Something heavy going into the water. */
  splash(): void {
    this.hiss("lowpass", 500, 2400, 0.12, 0.7);
    this.hiss("bandpass", 2600, 700, 0.7, 0.6, 0.08);
    this.tone("sine", 140, 50, 0.3, 0.5);
  }

  /** Home: a fanfare and the Empress Hen. */
  fanfare(): void {
    for (const [note, at, length] of [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.5], [784, 0.62, 0.12], [1047, 0.74, 0.7]] as const) {
      this.tone("square", note, note, length, 0.14, at);
      this.tone("triangle", note / 2, note / 2, length, 0.3, at);
    }
    // Buk, buk, buk, bu-GAWK.
    for (const [at, pitch] of [[1.1, 420], [1.3, 440], [1.5, 430], [1.72, 400]] as const) this.tone("sawtooth", pitch, pitch * 0.7, 0.08, 0.2, at);
    this.tone("sawtooth", 520, 900, 0.16, 0.26, 1.86);
    this.tone("sawtooth", 900, 380, 0.3, 0.26, 2.02);
  }
}
