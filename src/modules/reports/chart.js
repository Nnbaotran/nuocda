// Biểu đồ đường SVG thuần (không thư viện). Một trục tiền duy nhất.
// Màu 3 đường: bảng màu đã kiểm tra cho người mù màu, riêng cho nền sáng (#fff) và nền tối (#111114).
// Chạm / rê chuột: đường dóng dọc + chấm + ô thông tin các giá trị tại mốc đó.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatVND } from '../../lib/format.js';
import { compactVND, niceTicks } from './logic.js';

// xanh dương, cam, xanh ngọc
const PALETTE = {
  light: { series: ['#2a7ee0', '#e0601d', '#009e80'], surface: '#ffffff', axis: '#647084', grid: 'rgba(15,23,42,.08)', zero: 'rgba(15,23,42,.35)', cross: 'rgba(15,23,42,.35)' },
  dark: { series: ['#338ced', '#e76624', '#00a888'], surface: '#111114', axis: '#a5a5b1', grid: 'rgba(255,255,255,.07)', zero: 'rgba(255,255,255,.28)', cross: 'rgba(255,255,255,.35)' },
};
const pal = () => PALETTE[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];

/**
 * series: [{ key, label }] (tối đa 3, màu theo thứ tự cố định)
 * points: [{ key, [series.key]: số }]
 * label(key) -> nhãn ngắn trục X; longLabel(key) -> nhãn trong ô thông tin
 */
export function mountLineChart(container, { series, points, label, longLabel, height = 240 }) {
  setHtml(
    container,
    html`<div class="space-y-2">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2" aria-label="Chú thích">
        ${series.map((s, i) => html`<li class="flex items-center gap-1.5"><span class="inline-block h-0.5 w-4 rounded" data-swatch="${i}" style="background:${pal().series[i]}"></span>${s.label}</li>`)}
      </ul>
      <div class="relative" data-plot>
        <div class="pointer-events-none absolute z-10 hidden min-w-40 rounded-xl border border-fg/10 bg-field/95 px-3 py-2 text-xs shadow-xl" data-tip></div>
      </div>
    </div>`,
  );
  const plot = $('[data-plot]', container);
  const tip = $('[data-tip]', plot);
  let svg;

  function draw() {
    svg?.remove();
    const P = pal();
    const SERIES_COLORS = P.series;
    container.querySelectorAll('[data-swatch]').forEach((el) => (el.style.background = SERIES_COLORS[Number(el.dataset.swatch)]));
    const W = Math.max(280, plot.clientWidth || 600);
    const H = height;
    const m = { l: 48, r: 10, t: 10, b: 26 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const vals = points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0));
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const n = points.length;
    const x = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));

    const ns = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Biểu đồ ${series.map((s) => s.label).join(', ')} theo thời gian`);

    let inner = '';
    for (const t of ticks) {
      inner += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? P.zero : P.grid}" stroke-width="1"/>`;
      inner += `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${P.axis}">${compactVND(t)}</text>`;
    }
    points.forEach((p, i) => {
      // nhãn đều nhau + nhãn cuối; bỏ nhãn đều nếu quá sát nhãn cuối để không đè chữ
      const last = i === n - 1;
      if ((i % every === 0 && (last || n - 1 - i >= every * 0.6)) || last) {
        inner += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}" font-size="11" fill="${P.axis}">${label(p.key)}</text>`;
      }
    });
    series.forEach((s, si) => {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(p[s.key]) || 0).toFixed(1)}`).join('');
      inner += `<path d="${d}" fill="none" stroke="${SERIES_COLORS[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n === 1) inner += `<circle cx="${x(0)}" cy="${y(Number(points[0][s.key]) || 0)}" r="4" fill="${SERIES_COLORS[si]}"/>`;
    });
    inner += `<g data-hover style="display:none"><line data-cross y1="${m.t}" y2="${m.t + ih}" stroke="${P.cross}" stroke-width="1"/>${series
      .map((_, si) => `<circle data-dot="${si}" r="4" fill="${SERIES_COLORS[si]}" stroke="${P.surface}" stroke-width="2"/>`)
      .join('')}</g>`;
    inner += `<rect data-hit x="${m.l}" y="0" width="${iw}" height="${H}" fill="transparent"/>`;
    svg.innerHTML = inner;
    plot.prepend(svg);

    const g = svg.querySelector('[data-hover]');
    const hit = svg.querySelector('[data-hit]');
    const show = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      const p = points[i];
      g.style.display = '';
      g.querySelector('[data-cross]').setAttribute('x1', x(i));
      g.querySelector('[data-cross]').setAttribute('x2', x(i));
      series.forEach((s, si) => {
        const c = g.querySelector(`[data-dot="${si}"]`);
        c.setAttribute('cx', x(i));
        c.setAttribute('cy', y(Number(p[s.key]) || 0));
      });
      setHtml(tip, html`<p class="mb-1 font-semibold text-fg">${longLabel(p.key)}</p>
        ${series.map((s, si) => html`<p class="flex items-center justify-between gap-3">
          <span class="flex items-center gap-1.5 text-fg-2"><span class="inline-block size-2 rounded-full" style="background:${SERIES_COLORS[si]}"></span>${s.label}</span>
          <span class="font-semibold text-fg tabular-nums">${formatVND(p[s.key])}</span></p>`)}`);
      tip.classList.remove('hidden');
      const left = (x(i) / W) * rect.width;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(rect.width - tw, left - tw / 2))}px`;
      tip.style.top = '0px';
    };
    const hide = () => {
      g.style.display = 'none';
      tip.classList.add('hidden');
    };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  }

  draw();
  const ro = new ResizeObserver(() => draw());
  ro.observe(plot);
  // Đổi sáng/tối -> vẽ lại bằng bộ màu của chế độ mới (tự gỡ khi biểu đồ không còn trên trang)
  const onTheme = () => (container.isConnected ? draw() : window.removeEventListener('theme-change', onTheme));
  window.addEventListener('theme-change', onTheme);
  return { destroy: () => { ro.disconnect(); window.removeEventListener('theme-change', onTheme); } };
}
