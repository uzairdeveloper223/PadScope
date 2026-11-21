export class StickPlot {
  private context: CanvasRenderingContext2D;
  private history: [number, number][] = [];
  private width = 200;
  private height = 200;
  private lastPoint = '';
  private palette = { paper: '#f5f8f9', line: '#c1d0d9', grid: '#d7e1e7', zone: '#dce8e9', zoneLine: '#adc5c9', label: '#526875' };

  constructor(canvas: HTMLCanvasElement, private color: string) {
    this.context = canvas.getContext('2d')!;
    const refreshTheme = () => {
      const style = getComputedStyle(canvas);
      const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      this.color = token('--series', this.color);
      this.palette = { paper: token('--plot-paper', this.palette.paper), line: token('--plot-line', this.palette.line), grid: token('--plot-grid', this.palette.grid), zone: token('--plot-zone', this.palette.zone), zoneLine: token('--plot-zone-line', this.palette.zoneLine), label: token('--plot-label', this.palette.label) };
    };
    window.addEventListener('padscope-theme', refreshTheme);
    refreshTheme();
    new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      this.width = canvas.clientWidth;
      this.height = canvas.clientHeight;
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.draw([0, 0], [0, 0], .05, false, false);
    }).observe(canvas);
  }

  clear(): void { this.history = []; this.lastPoint = ''; }

  draw(raw: [number, number], corrected: [number, number], deadzone: number, trails: boolean, active: boolean): void {
    const ctx = this.context, width = this.width, height = this.height;
    const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .39;
    const point = (x: number, y: number): [number, number] => [cx + x * radius, cy + y * radius];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.palette.paper;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.palette.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = this.palette.grid;
    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, radius / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = this.palette.zone; ctx.strokeStyle = this.palette.zoneLine;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, radius * deadzone), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.palette.label; ctx.font = '9px Barlow, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('−1', cx - radius - 12, cy + 3); ctx.fillText('+1', cx + radius + 12, cy + 3);
    ctx.fillText('−1', cx, cy - radius - 7); ctx.fillText('+1', cx, cy + radius + 13);
    if (!active) { ctx.fillStyle = this.palette.label; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill(); return; }
    const signature = raw.map(n => n.toFixed(3)).join(',');
    if (signature !== this.lastPoint) {
      this.history.push([...raw]);
      if (this.history.length > 160) this.history.shift();
      this.lastPoint = signature;
    }
    if (trails && this.history.length > 1) {
      ctx.strokeStyle = this.color; ctx.globalAlpha = .22; ctx.lineWidth = 1.5;
      ctx.beginPath(); this.history.forEach(([x, y], i) => { const [px, py] = point(x, y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const [rawX, rawY] = point(...raw), [x, y] = point(...corrected);
    ctx.strokeStyle = this.color; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(rawX, rawY, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fill();
  }
}
