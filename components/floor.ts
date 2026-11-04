import { AGENTS } from '@/lib/agents';
import { ENG_LABEL, ICON, LOGO_SVG } from './icons';

// Draws the Live floor: the orchestrator, the crew lined up in the order work flows,
// the bench, and messages travelling along the lines. Plain DOM for smooth animation.
const NS = 'http://www.w3.org/2000/svg';
const CARD_W = 150, CARD_H = 104, TOP = 52, STAGE_H = 470;

interface NodeRec { id: string; name: string; el: HTMLDivElement; th: HTMLDivElement; en: HTMLDivElement; x: number; y: number; state: string; eng: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));

export class Floor {
  private nodes: Record<string, NodeRec> = {};
  private depth: Record<string, number> = {};
  private cols: string[][] = [];
  private edges: Record<string, { p: SVGPathElement; from: string; to: string }> = {};
  private edgeG: SVGGElement;
  private reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private alive = true;

  constructor(private floor: HTMLDivElement) {
    floor.querySelectorAll('.node, .chip').forEach((n) => n.remove());
    this.edgeG = floor.querySelector('#edgeG') as SVGGElement;
    this.make('orch', 'Orchestrator', 'plans and routes', true);
    AGENTS.forEach((a) => this.make(a.id, a.name, ENG_LABEL[a.tier], false));
    this.reset();
  }

  destroy() { this.alive = false; }

  private make(id: string, name: string, eng: string, orch: boolean) {
    const d = document.createElement('div');
    d.className = 'node ' + (orch ? 'orch' : 'bench');
    d.innerHTML = '<div class="n-top">' + (orch ? '<span class="mark">' + LOGO_SVG + '</span>' : '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[id] + '</svg><span class="badge"><svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#FFF" stroke-width="2"><path d="M1.5 5.2l2.3 2.3 4.7-5"/></svg></span></div>') +
      '<div style="min-width:0"><div class="n-name">' + name + '</div><div class="n-eng">' + eng + '</div></div></div><div class="thought">' + (orch ? 'Waiting for something to do.' : '') + '</div>';
    this.floor.appendChild(d);
    this.nodes[id] = { id, name, el: d, th: d.querySelector('.thought')!, en: d.querySelector('.n-eng')!, x: 0, y: 0, state: orch ? 'orch' : 'bench', eng };
  }

  reset() {
    this.edgeG.innerHTML = ''; this.edges = {}; this.depth = {}; this.cols = [];
    Object.values(this.nodes).forEach((n) => { if (n.id === 'orch') return; n.state = 'bench'; n.el.className = 'node bench'; n.th.textContent = ''; n.en.textContent = n.eng; });
    this.orch('Waiting for something to do.');
    this.layout();
  }

  busy(on: boolean) { this.nodes.orch.el.classList.toggle('busy', on); }
  orch(text: string) { this.nodes.orch.th.textContent = text; }

  setLineup(lineup: string[][]) {
    this.cols = lineup; this.depth = {};
    lineup.forEach((col, i) => col.forEach((id) => { this.depth[id] = i + 1; this.setState(id, 'queued'); this.nodes[id].th.textContent = 'Called off the bench.'; }));
    this.layout();
  }

  layout() {
    const width = this.floor.clientWidth || 1120;
    const ncols = Math.max(1, this.cols.length);
    const colW = (width - 40 - CARD_W) / ncols;
    const o = this.nodes.orch;
    o.x = 20; o.y = TOP + (STAGE_H - CARD_H) / 2; this.place(o, CARD_W, CARD_H);
    this.cols.forEach((col, ci) => {
      const total = col.length * CARD_H + (col.length - 1) * 12, y0 = TOP + (STAGE_H - total) / 2;
      col.forEach((id, ri) => { const n = this.nodes[id]; n.x = 20 + (ci + 1) * colW; n.y = y0 + ri * (CARD_H + 12); this.place(n, CARD_W, CARD_H); });
    });
    const benched = AGENTS.filter((a) => this.depth[a.id] === undefined);
    const gap = Math.min(96, (width - 110) / Math.max(1, benched.length));
    benched.forEach((a, i) => { const n = this.nodes[a.id]; n.x = 90 + i * gap; n.y = 572; this.place(n, 76, 62); });
    Object.values(this.edges).forEach((e) => e.p.setAttribute('d', this.edgeD(e.from, e.to)));
  }

  private place(n: NodeRec, w: number, h: number) { Object.assign(n.el.style, { left: n.x + 'px', top: n.y + 'px', width: w + 'px', height: h + 'px' }); }

  setState(id: string, s: string) {
    const n = this.nodes[id]; if (!n || id === 'orch') return;
    n.state = s; n.el.className = 'node ' + s;
  }

  finish() { Object.keys(this.depth).forEach((id) => this.setState(id, 'done')); this.busy(false); }

  private d(id: string) { return id === 'orch' || id === 'you' ? 0 : this.depth[id] ?? 0; }

  private edgeD(from: string, to: string) {
    const f = this.nodes[from === 'you' ? 'orch' : from], t = this.nodes[to === 'you' ? 'orch' : to];
    const df = this.d(from), dt = this.d(to);
    if (dt > df) {
      const x1 = f.x + CARD_W, y1 = f.y + CARD_H / 2, x2 = t.x, y2 = t.y + CARD_H / 2, mx = (x1 + x2) / 2;
      return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
    }
    const sx = f.x + CARD_W / 2 + (dt < df ? -24 : 24), sy = f.y, ex = t.x + CARD_W / 2 + 24, ey = t.y;
    const lift = Math.max(18, Math.min(sy, ey) - 30 - Math.abs(df - dt) * 4);
    return `M${sx} ${sy} C${sx} ${lift} ${ex} ${lift} ${ex} ${ey}`;
  }

  private edge(from: string, to: string) {
    const k = from + '>' + to;
    if (!this.edges[k]) { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'edge'); this.edgeG.appendChild(p); this.edges[k] = { p, from, to }; }
    this.edges[k].p.setAttribute('d', this.edgeD(from, to));
    return this.edges[k];
  }

  async msg(from: string, to: string, label: string, kind?: string): Promise<void> {
    if (from === 'you' || to === 'you') return;
    let e = this.edges[from + '>' + to], back = false;
    if (!e && this.edges[to + '>' + from] && this.d(to) > this.d(from)) { e = this.edges[to + '>' + from]; back = true; }
    if (!e) e = this.edge(from, to);
    if (to !== 'orch' && this.nodes[to].state !== 'working') this.setState(to, 'listening');
    if (from === 'orch') this.orch('Sending to ' + this.nodes[to].name + '…');
    e.p.classList.add('hot'); if (kind === 'alert') e.p.classList.add('alert');
    if (this.reduce) { await new Promise((r) => setTimeout(r, 150)); e.p.classList.remove('hot', 'alert'); return; }
    const c = document.createElement('div'); c.className = 'chip ' + (kind || ''); c.textContent = label; this.floor.appendChild(c);
    const L = e.p.getTotalLength(), dur = Math.max(800, Math.min(1400, L * 2.2));
    await new Promise<void>((res) => {
      const t0 = performance.now();
      const step = (t: number) => {
        if (!this.alive) { c.remove(); return res(); }
        const k = Math.min(1, (t - t0) / dur), ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const pt = e.p.getPointAtLength((back ? 1 - ease : ease) * L);
        c.style.left = pt.x + 'px'; c.style.top = pt.y + 'px';
        if (k < 1) requestAnimationFrame(step); else { c.remove(); e.p.classList.remove('hot', 'alert'); res(); }
      };
      requestAnimationFrame(step);
    });
  }

  // Starts typing and resolves soon, so several agents can be seen working at once.
  work(id: string, text: string, model: string): Promise<void> {
    const n = this.nodes[id]; if (!n) return Promise.resolve();
    this.setState(id, 'working');
    n.en.textContent = model;
    if (this.reduce) { n.th.textContent = text; return Promise.resolve(); }
    let i = 0; const stepMs = Math.max(12, 1600 / Math.max(1, text.length));
    const go = () => {
      if (!this.alive) return;
      i++; n.th.innerHTML = esc(text.slice(0, i)) + '<span class="caret"></span>';
      if (i < text.length) setTimeout(go, stepMs); else { n.th.textContent = text; if (n.state === 'working') this.setState(id, 'ready'); }
    };
    go();
    return new Promise((r) => setTimeout(r, Math.min(700, stepMs * text.length)));
  }
}
