export class RangeRound {
  status: 'idle' | 'running' | 'paused' | 'finished' = 'idle';
  elapsed = 0;
  score = 0;
  shots = 0;
  hits = 0;
  streak = 0;
  bestStreak = 0;
  readonly duration = 60;

  get remaining(): number { return Math.max(0, this.duration - this.elapsed); }
  get accuracy(): number { return this.shots ? Math.round(this.hits / this.shots * 100) : 0; }

  start(): void { this.status = 'running'; this.elapsed = 0; this.score = 0; this.shots = 0; this.hits = 0; this.streak = 0; this.bestStreak = 0; }
  pause(): void { if (this.status === 'running') this.status = 'paused'; }
  resume(): void { if (this.status === 'paused') this.status = 'running'; }
  advance(dt: number): void {
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    if (this.elapsed >= this.duration) this.status = 'finished';
  }

  shoot(hit: boolean, bullseye = false, small = false): number {
    if (this.status !== 'running') return 0;
    this.shots++;
    if (!hit) { this.streak = 0; return 0; }
    this.hits++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    const points = (small ? 150 : 100) + (bullseye ? 50 : 0) + Math.min(5, this.streak - 1) * 10;
    this.score += points;
    return points;
  }
}
