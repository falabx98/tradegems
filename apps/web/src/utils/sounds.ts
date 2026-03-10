// ─── Game Sound Engine ──────────────────────────────────────────────────────
// Procedural Web Audio API sounds — no external files needed
// Each node type gets a unique, satisfying sound

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let _volume = 0.35;
let _muted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = _muted ? 0 : _volume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

// ─── Volume Controls ────────────────────────────────────────────────────────

export function setVolume(v: number) {
  _volume = Math.max(0, Math.min(1, v));
  if (masterGain && !_muted) {
    masterGain.gain.value = _volume;
  }
}

export function getVolume(): number {
  return _volume;
}

export function setMuted(muted: boolean) {
  _muted = muted;
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : _volume;
  }
}

export function isMuted(): boolean {
  return _muted;
}

// ─── Helper: play a tone ────────────────────────────────────────────────────

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  attack?: number;
  decay?: number;
  detune?: number;
}

function playTone(opts: ToneOpts) {
  const ctx = getCtx();
  const master = getMaster();
  const {
    freq,
    type = 'sine',
    duration = 0.15,
    gain = 0.3,
    attack = 0.01,
    decay = duration - 0.02,
    detune = 0,
  } = opts;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;

  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay);

  osc.connect(g);
  g.connect(master);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.05);
}

// ─── Helper: noise burst ────────────────────────────────────────────────────

function playNoise(duration: number, gain: number, filterFreq?: number, filterType?: BiquadFilterType) {
  const ctx = getCtx();
  const master = getMaster();

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    source.connect(filter);
    filter.connect(g);
  } else {
    source.connect(g);
  }

  g.connect(master);
  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration + 0.05);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NODE SOUNDS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── MULTIPLIER HIT ─────────────────────────────────────────────────────────
// Bright ascending chime — satisfying "cha-ching" feel
// Higher value = higher pitch, rarer = more harmonic richness

export function playMultiplierHit(value: number = 1.2, rarity: string = 'common') {
  const baseFreq = 523; // C5
  const pitchBoost = Math.min(value, 5) * 60; // Higher value = higher pitch

  // Main tone — bright sine
  playTone({ freq: baseFreq + pitchBoost, type: 'sine', duration: 0.2, gain: 0.35, attack: 0.005 });

  // Harmonics — 5th above (major feel)
  setTimeout(() => {
    playTone({ freq: (baseFreq + pitchBoost) * 1.5, type: 'sine', duration: 0.15, gain: 0.15, attack: 0.005 });
  }, 30);

  // Octave shimmer for rare+
  if (rarity === 'rare' || rarity === 'legendary') {
    setTimeout(() => {
      playTone({ freq: (baseFreq + pitchBoost) * 2, type: 'sine', duration: 0.25, gain: 0.12, attack: 0.01 });
    }, 60);
  }

  // Sparkle noise for legendary
  if (rarity === 'legendary') {
    setTimeout(() => {
      playNoise(0.15, 0.06, 8000, 'highpass');
    }, 20);
  }
}

// ─── DIVIDER HIT ────────────────────────────────────────────────────────────
// Heavy descending buzz — "ouch" feel
// Higher divider value = deeper, more impactful

export function playDividerHit(value: number = 1.4) {
  const baseFreq = 180;
  const depthDrop = Math.min(value, 3.5) * 30;

  // Main buzz — low triangle wave descending
  const ctx = getCtx();
  const master = getMaster();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(baseFreq - depthDrop, ctx.currentTime + 0.2);

  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  // Distortion for grit
  const dist = ctx.createWaveShaperFunction ? null : null; // Use filter instead
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 2;

  osc.connect(filter);
  filter.connect(g);
  g.connect(master);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);

  // Impact thud
  setTimeout(() => {
    playTone({ freq: 60, type: 'sine', duration: 0.12, gain: 0.2, attack: 0.002 });
  }, 10);

  // Noise burst
  playNoise(0.08, 0.1, 600, 'lowpass');
}

// ─── SHIELD HIT ─────────────────────────────────────────────────────────────
// Metallic ping/clink — like picking up armor

export function playShieldHit() {
  // Metallic ring — triangle wave with harmonics
  playTone({ freq: 1200, type: 'triangle', duration: 0.3, gain: 0.2, attack: 0.002 });

  // Harmonic shimmer
  setTimeout(() => {
    playTone({ freq: 1800, type: 'sine', duration: 0.2, gain: 0.1, attack: 0.005 });
  }, 15);

  // Low body
  playTone({ freq: 400, type: 'triangle', duration: 0.15, gain: 0.12, attack: 0.003 });

  // Sparkle
  setTimeout(() => {
    playNoise(0.08, 0.04, 6000, 'highpass');
  }, 30);
}

// ─── SHIELD BLOCK ───────────────────────────────────────────────────────────
// Metallic clang — shield consumed to block a divider

export function playShieldBlock() {
  // Heavy clang
  playTone({ freq: 800, type: 'square', duration: 0.15, gain: 0.2, attack: 0.002 });
  playTone({ freq: 600, type: 'triangle', duration: 0.25, gain: 0.15, attack: 0.003 });

  // Metal rattle
  setTimeout(() => {
    playNoise(0.12, 0.08, 3000, 'bandpass');
  }, 20);

  // Impact
  playTone({ freq: 150, type: 'sine', duration: 0.1, gain: 0.15, attack: 0.002 });
}

// ─── FAKE BREAKOUT HIT ─────────────────────────────────────────────────────
// Alert warning — quick double beep

export function playFakeBreakoutHit() {
  // First beep
  playTone({ freq: 880, type: 'square', duration: 0.08, gain: 0.18, attack: 0.002 });

  // Second beep (slightly lower)
  setTimeout(() => {
    playTone({ freq: 660, type: 'square', duration: 0.08, gain: 0.18, attack: 0.002 });
  }, 100);

  // Wobbly undertone
  const ctx = getCtx();
  const master = getMaster();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.setValueAtTime(520, ctx.currentTime + 0.05);
  osc.frequency.setValueAtTime(380, ctx.currentTime + 0.1);
  g.gain.setValueAtTime(0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(g);
  g.connect(master);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.25);
}

// ─── VOLATILITY SPIKE HIT ──────────────────────────────────────────────────
// Electric whoosh — rising sweep with noise

export function playVolatilitySpikeHit() {
  // Frequency sweep up
  const ctx = getCtx();
  const master = getMaster();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.2);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.2);
  filter.Q.value = 1;

  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.connect(filter);
  filter.connect(g);
  g.connect(master);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);

  // Static noise
  setTimeout(() => {
    playNoise(0.15, 0.06, 4000, 'highpass');
  }, 50);
}

// ─── NEAR MISS ──────────────────────────────────────────────────────────────
// Quick subtle swoosh

export function playNearMiss() {
  playNoise(0.1, 0.05, 2000, 'bandpass');
  playTone({ freq: 300, type: 'sine', duration: 0.08, gain: 0.06, attack: 0.005 });
}

// ─── NODE MISS ──────────────────────────────────────────────────────────────
// Soft thud / plop

export function playNodeMiss() {
  playTone({ freq: 120, type: 'sine', duration: 0.06, gain: 0.08, attack: 0.002 });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GAME EVENT SOUNDS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── COUNTDOWN BEEP ─────────────────────────────────────────────────────────
// Short beep for 3, 2, 1 countdown

export function playCountdownBeep(num: number) {
  const freq = num === 1 ? 880 : 660; // Higher pitch on "1" (GO!)
  const gain = num === 1 ? 0.25 : 0.15;
  const duration = num === 1 ? 0.2 : 0.1;

  playTone({ freq, type: 'sine', duration, gain, attack: 0.005 });

  if (num === 1) {
    // Extra sparkle on GO
    setTimeout(() => {
      playTone({ freq: 1320, type: 'sine', duration: 0.15, gain: 0.1, attack: 0.005 });
    }, 40);
  }
}

// ─── ROUND START ────────────────────────────────────────────────────────────
// Quick ascending arpeggio

export function playRoundStart() {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone({ freq, type: 'sine', duration: 0.12, gain: 0.2 - i * 0.03, attack: 0.005 });
    }, i * 60);
  });
}

// ─── ROUND END ──────────────────────────────────────────────────────────────
// Resolution chord

export function playRoundEnd(won: boolean) {
  if (won) {
    // Major chord — triumphant
    playTone({ freq: 523, type: 'sine', duration: 0.4, gain: 0.2, attack: 0.01 });
    playTone({ freq: 659, type: 'sine', duration: 0.4, gain: 0.15, attack: 0.01 });
    playTone({ freq: 784, type: 'sine', duration: 0.4, gain: 0.12, attack: 0.01 });
    setTimeout(() => {
      playTone({ freq: 1047, type: 'sine', duration: 0.3, gain: 0.1, attack: 0.01 });
    }, 150);
  } else {
    // Minor descending — somber
    playTone({ freq: 392, type: 'triangle', duration: 0.3, gain: 0.15, attack: 0.01 });
    playTone({ freq: 311, type: 'triangle', duration: 0.3, gain: 0.12, attack: 0.01 });
    setTimeout(() => {
      playTone({ freq: 262, type: 'triangle', duration: 0.4, gain: 0.1, attack: 0.02 });
    }, 150);
  }
}

// ─── BATTLE JOIN ────────────────────────────────────────────────────────────

export function playBattleJoin() {
  playTone({ freq: 440, type: 'sine', duration: 0.1, gain: 0.15, attack: 0.005 });
  setTimeout(() => {
    playTone({ freq: 660, type: 'sine', duration: 0.15, gain: 0.2, attack: 0.005 });
  }, 80);
}

// ─── MULTIPLIER MILESTONE ───────────────────────────────────────────────────
// Extra satisfying sound when crossing 2x, 3x, 5x, etc.

export function playMultiplierMilestone(milestone: number) {
  const baseFreq = 600 + milestone * 80;

  // Ascending fanfare
  playTone({ freq: baseFreq, type: 'sine', duration: 0.15, gain: 0.25, attack: 0.003 });
  setTimeout(() => {
    playTone({ freq: baseFreq * 1.25, type: 'sine', duration: 0.15, gain: 0.2, attack: 0.003 });
  }, 70);
  setTimeout(() => {
    playTone({ freq: baseFreq * 1.5, type: 'sine', duration: 0.25, gain: 0.18, attack: 0.003 });
  }, 140);

  // Sparkle
  setTimeout(() => {
    playNoise(0.12, 0.05, 6000, 'highpass');
  }, 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DISPATCHER — call from node callbacks
// ═══════════════════════════════════════════════════════════════════════════════

export function playNodeActivatedSound(
  nodeType: string,
  value: number = 1.0,
  rarity: string = 'common',
  prevMultiplier: number = 1.0,
  newMultiplier: number = 1.0,
  shieldBlocked: boolean = false,
) {
  switch (nodeType) {
    case 'multiplier':
      playMultiplierHit(value, rarity);
      // Check milestones
      const milestones = [2, 3, 5, 8, 10];
      for (const m of milestones) {
        if (prevMultiplier < m && newMultiplier >= m) {
          setTimeout(() => playMultiplierMilestone(m), 200);
          break;
        }
      }
      break;

    case 'divider':
      if (shieldBlocked) {
        playShieldBlock();
      } else {
        playDividerHit(value);
      }
      break;

    case 'shield':
      playShieldHit();
      break;

    case 'fake_breakout':
      playFakeBreakoutHit();
      break;

    case 'volatility_spike':
      playVolatilitySpikeHit();
      break;

    default:
      playMultiplierHit(value, rarity);
  }
}
