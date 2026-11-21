import { element, text } from './ui.ts';
import type { BlasterId } from './game/aim.ts';

export type AudioArea = 'range' | 'inspection';
type Effect = 'shot-compact' | 'shot-carbine' | 'shot-longshot' | 'hit' | 'bullseye' | 'round-start' | 'round-complete';
interface AudioSettings { version: 1; rangeMusic: boolean; inspectionMusic: boolean; effects: boolean; musicVolume: number; effectsVolume: number }
interface Music { audio: HTMLAudioElement; gain: GainNode; playing: boolean; stopTimer: number; request: number; error: string }
const effects: Effect[] = ['shot-compact', 'shot-carbine', 'shot-longshot', 'hit', 'bullseye', 'round-start', 'round-complete'];
const defaultAudioSettings = (): AudioSettings => ({ version: 1, rangeMusic: true, inspectionMusic: true, effects: true, musicVolume: .24, effectsVolume: .45 });

export class WorkbenchAudio {
  private settings = defaultAudioSettings();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effectGain: GainNode | null = null;
  private buffers = new Map<Effect, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private effectError = false;
  private music = new Map<AudioArea, Music>();
  private active: Record<AudioArea, boolean> = { range: false, inspection: false };
  private focused = true;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem('padscope:audio') ?? 'null') as AudioSettings | null;
      if (s?.version === 1 && [s.rangeMusic, s.inspectionMusic, s.effects].every(v => typeof v === 'boolean') &&
          [s.musicVolume, s.effectsVolume].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) this.settings = s;
    } catch { /* Audio works with session defaults. */ }
    for (const area of ['range', 'inspection'] as const) {
      const prefix = area === 'range' ? 'range' : 'inspect';
      const section = element(area === 'range' ? 'target-range' : 'blaster-inspection');
      section.addEventListener('pointerdown', () => this.unlock(area));
      section.addEventListener('keydown', event => { if (!event.repeat) this.unlock(area); });
      element(`${prefix}-music`).addEventListener('change', event => {
        this.settings[area === 'range' ? 'rangeMusic' : 'inspectionMusic'] = (event.target as HTMLInputElement).checked;
        this.persist(); this.syncControls(); this.unlock(area);
      });
      element(`${prefix}-music-volume`).addEventListener('input', event => {
        this.settings.musicVolume = Number((event.target as HTMLInputElement).value) / 100;
        this.persist(); this.syncControls(); this.unlock(area);
      });
    }
    element('range-sfx').addEventListener('change', event => {
      this.settings.effects = (event.target as HTMLInputElement).checked;
      this.persist(); this.syncControls(); this.unlock('range');
    });
    element('range-effects-volume').addEventListener('input', event => {
      this.settings.effectsVolume = Number((event.target as HTMLInputElement).value) / 100;
      this.persist(); this.syncControls(); this.unlock('range');
    });
    window.addEventListener('blur', () => { this.focused = false; this.sync(); });
    window.addEventListener('focus', () => { this.focused = true; this.sync(); });
    document.addEventListener('visibilitychange', () => this.sync());
    window.addEventListener('pagehide', () => { this.focused = false; this.sync(); });
    this.syncControls(); this.status();
  }

  /** Call synchronously from a click/key gesture; hardware input cannot unlock audio. */
  unlock(area: AudioArea): void {
    if (!window.AudioContext) { this.status(); return; }
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.connect(this.context.destination);
        this.effectGain = this.context.createGain(); this.effectGain.connect(this.master);
        this.context.addEventListener('statechange', () => this.sync());
      }
      if (!this.music.has(area)) {
        const audio = new Audio(`${import.meta.env.BASE_URL}audio/${area === 'range' ? 'range' : 'inspection'}-music.mp3`);
        audio.loop = true; audio.preload = 'none';
        const gain = this.context.createGain(); gain.gain.value = 0;
        this.context.createMediaElementSource(audio).connect(gain); gain.connect(this.master!);
        const music: Music = { audio, gain, playing: false, stopTimer: 0, request: 0, error: '' };
        audio.addEventListener('error', () => { music.error = 'Music could not load. Toggle music to retry.'; music.playing = false; this.status(); });
        this.music.set(area, music);
      }
      const music = this.music.get(area)!;
      if (music.error) { music.error = ''; music.audio.load(); }
      void this.context.resume().then(() => this.sync()).catch(() => this.status());
      if (area === 'range' && this.settings.effects) void this.loadEffects();
      this.sync();
    } catch (error) { console.error('Audio unavailable', error); this.status(); }
  }

  setActive(area: AudioArea, active: boolean): void {
    if (this.active[area] === active) return;
    this.active[area] = active; this.sync();
  }

  private ramp(param: AudioParam, value: number, duration = .25): void {
    const now = this.context!.currentTime;
    param.cancelAndHoldAtTime(now); param.linearRampToValueAtTime(value, now + duration);
  }

  private sync(): void {
    if (!this.context) { this.status(); return; }
    const audible = this.focused && !document.hidden;
    this.ramp(this.master!.gain, audible ? 1 : 0, .04);
    this.ramp(this.effectGain!.gain, this.settings.effects && this.active.range ? this.settings.effectsVolume : 0, .04);
    const chosen = this.active.inspection && this.settings.inspectionMusic ? 'inspection' : this.active.range && this.settings.rangeMusic ? 'range' : null;
    for (const [area, music] of this.music) {
      const play = audible && this.context.state === 'running' && chosen === area;
      this.ramp(music.gain.gain, play ? this.settings.musicVolume : 0);
      if (play && !music.playing && !music.error) {
        window.clearTimeout(music.stopTimer); music.playing = true;
        const request = ++music.request;
        void music.audio.play().catch(() => {
          if (music.request !== request || !music.playing) return;
          music.playing = false; music.error = 'Click the music control to enable playback.'; this.status();
        });
      } else if (!play && music.playing) {
        music.playing = false; music.request++;
        music.stopTimer = window.setTimeout(() => { if (!music.playing) music.audio.pause(); }, audible ? 280 : 0);
      }
    }
    this.status();
  }

  private async loadEffects(): Promise<void> {
    if (this.buffers.size === effects.length || this.loading || !this.context) return this.loading ?? undefined;
    this.effectError = false;
    this.loading = Promise.allSettled(effects.map(async name => {
      if (this.buffers.has(name)) return;
      const response = await fetch(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
      if (!response.ok) throw new Error(`Could not load ${name}: ${response.status}`);
      this.buffers.set(name, await this.context!.decodeAudioData(await response.arrayBuffer()));
    })).then(results => {
      this.effectError = results.some(result => result.status === 'rejected');
      for (const result of results) if (result.status === 'rejected') console.error('Range sound effect unavailable', result.reason);
    }).finally(() => { this.loading = null; this.status(); });
    this.status(); return this.loading;
  }

  private effect(name: Effect, delay = 0, volume = 1): void {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.active.range || !this.focused || document.hidden || !this.settings.effects || this.context?.state !== 'running') return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = volume;
    source.connect(gain); gain.connect(this.effectGain!);
    source.addEventListener('ended', () => { source.disconnect(); gain.disconnect(); });
    source.start(this.context.currentTime + delay);
  }

  shot(blaster: BlasterId, hit: boolean, bullseye: boolean): void {
    this.effect(`shot-${blaster}`, 0, .7);
    if (hit) this.effect(bullseye ? 'bullseye' : 'hit', .055, bullseye ? .4 : .65);
  }
  roundStart(): void { this.effect('round-start', 0, .35); }
  roundComplete(): void { this.effect('round-complete', 0, .4); }

  private syncControls(): void {
    for (const [prefix, enabled] of [['range', this.settings.rangeMusic], ['inspect', this.settings.inspectionMusic]] as const) {
      element<HTMLInputElement>(`${prefix}-music`).checked = enabled;
      element<HTMLInputElement>(`${prefix}-music-volume`).value = String(Math.round(this.settings.musicVolume * 100));
      text(`${prefix}-music-volume-value`, `${Math.round(this.settings.musicVolume * 100)}%`);
    }
    element<HTMLInputElement>('range-sfx').checked = this.settings.effects;
    element<HTMLInputElement>('range-effects-volume').value = String(Math.round(this.settings.effectsVolume * 100));
    text('range-effects-volume-value', `${Math.round(this.settings.effectsVolume * 100)}%`);
  }

  private status(): void {
    for (const area of ['range', 'inspection'] as const) {
      const prefix = area === 'range' ? 'range' : 'inspect', music = this.music.get(area);
      const enabled = area === 'range' ? this.settings.rangeMusic : this.settings.inspectionMusic;
      let status = 'Click the music control to enable audio.';
      if (!window.AudioContext) status = 'Audio is unavailable in this browser.';
      else if (music?.error) status = music.error;
      else if (this.context?.state === 'running') status = music?.playing ? `Music: ${area === 'range' ? 'Space Jazz' : 'Floating Cities'}` : enabled ? 'Music waits while this area is out of view.' : 'Music off.';
      if (area === 'range' && this.effectError) status += ' Some effects could not load; toggle effects to retry.';
      text(`${prefix}-audio-status`, status);
    }
  }

  private persist(): void { try { localStorage.setItem('padscope:audio', JSON.stringify(this.settings)); } catch { /* Keep session settings. */ } }
}
