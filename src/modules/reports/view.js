// Trang Báo cáo (chỉ Chủ): thẻ tổng quan + 3 góc nhìn (tổng toàn bộ, theo khách, theo sản phẩm), xuất CSV.
import { formatDateStr } from '../../lib/dates.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { downloadText } from '../../lib/download.js';
import { formatVND } from '../../lib/format.js';
import { mountRangeFilter } from '../../lib/range-filter.js';
import { emptyState, errorState, loadingState } from '../../lib/ui.js';
import { monthLabel, toCSV } from '../payroll/logic.js';
import { reportOverview } from './api.js';
import { mountLineChart } from './chart.js';
import { bucketLabel } from './logic.js';

const TABS = [
  { id: 'total', label: 'Tổng toàn bộ' },
  { id: 'customers', label: 'Theo khách' },
  { id: 'products', label: 'Theo sản phẩm' },
];
const qtyText = (q) => String(Number(q)).replace('.', ',');
const signed = (n) => (n < 0 ? `−${formatVND(-n)}` : formatVND(n));

export function renderReports(root) {
  const state = { range: null, includePayroll: true, tab: 'total', data: null, asTable: false };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div data-range></div>
      <label class="flex min-h-11 items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" class="size-5 accent-accent" data-payroll checked /> Tính lương nhân viên (đã chốt) vào chi phí
      </label>
      <div data-body>${loadingState(3)}</div>
    </section>`,
  );
  const section = $('section', root);
  const body = $('[data-body]', section);

  async function load() {
    setHtml(body, loadingState(3));
    try {
      state.data = await reportOverview({ from: state.range.from, to: state.range.to, includePayroll: state.includePayroll });
      draw();
    } catch (err) {
      setHtml(body, errorState(err.message, load));
    }
  }

  function card(label, value, sub = '', valueCls = 'text-fg') {
    return html`<div class="card p-3">
      <p class="text-xs text-muted">${label}</p>
      <p class="mt-1 text-xl font-bold tabular-nums ${valueCls}">${value}</p>
      ${sub ? html`<p class="mt-0.5 text-xs text-subtle">${sub}</p>` : ''}
    </div>`;
  }

  function draw() {
    const d = state.data;
    const s = d.summary;
    const cost = Number(s.expenses) + Number(s.payroll);
    const open = state.includePayroll ? s.payroll_open_months : [];
    setHtml(
      body,
      html`<div class="space-y-4">
        <p class="text-xs text-subtle">Từ ${formatDateStr(d.range.from)} đến ${formatDateStr(d.range.to)}</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          ${card('Doanh thu', formatVND(s.revenue), `${s.order_count} đơn · đã thu ${formatVND(s.collected)}`)}
          ${card('Chi phí', formatVND(cost), state.includePayroll ? `chi ${formatVND(s.expenses)} + lương ${formatVND(s.payroll)}` : 'chưa gồm lương')}
          ${card('Lợi nhuận', signed(s.profit), s.profit < 0 ? 'Lỗ' : 'Doanh thu − chi phí', s.profit < 0 ? 'text-bad' : 'text-good')}
          ${card('Công nợ phải thu', formatVND(s.receivable), `tính đến ${formatDateStr(d.range.to)}`, 'text-warn')}
        </div>
        ${open.length
          ? html`<p class="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-warn">
              Lương ${open.map((m) => monthLabel(m).toLowerCase()).join(', ')} chưa chốt nên chưa tính vào chi phí.</p>`
          : ''}
        <div class="flex gap-1 rounded-2xl border border-fg/10 bg-surface/70 p-1" role="tablist">
          ${TABS.map((t) => html`<button role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab ? 'true' : 'false'}"
            class="min-h-11 flex-1 rounded-xl text-sm font-medium transition ${t.id === state.tab ? 'bg-gradient-to-r from-accent/15 to-accent/5 text-fg ring-1 ring-accent/30' : 'text-muted hover:text-fg'}">${t.label}</button>`)}
        </div>
        <div class="fade-in" data-panel></div>
      </div>`,
    );
    const panel = $('[data-panel]', body);
    if (state.tab === 'total') drawTotal(panel);
    else if (state.tab === 'customers') drawCustomers(panel);
    else drawProducts(panel);
  }

  function exportBtn(kind) {
    return html`<button class="btn-secondary min-h-10" data-export="${kind}">Xuất CSV</button>`;
  }

  function drawTotal(panel) {
    const d = state.data;
    const series = d.series.map((p) => ({ ...p, cost: Number(p.expenses) + Number(p.payroll) }));
    const long = (k) => bucketLabel(k, true);
    setHtml(panel, html`<div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-muted">Theo ${d.granularity === 'day' ? 'ngày' : 'tháng'}</p>
        <div class="flex gap-2">
          <button class="btn-secondary min-h-10" data-toggle-table>${state.asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}</button>
          ${exportBtn('total')}
        </div>
      </div>
      ${state.asTable
        ? html`<div class="table-wrap overflow-x-auto"><table class="table">
            <thead><tr><th>${d.granularity === 'day' ? 'Ngày' : 'Tháng'}</th><th class="text-right">Doanh thu</th><th class="text-right">Chi phí</th><th class="text-right">Lợi nhuận</th></tr></thead>
            <tbody>${series.map((p) => html`<tr><td>${long(p.key)}</td><td class="text-right tabular-nums">${formatVND(p.revenue)}</td>
              <td class="text-right tabular-nums">${formatVND(p.cost)}</td><td class="text-right tabular-nums ${p.profit < 0 ? 'text-bad' : ''}">${signed(p.profit)}</td></tr>`)}</tbody>
          </table></div>`
        : html`<div class="card" data-chart></div>`}
    </div>`);
    const chartEl = $('[data-chart]', panel);
    if (chartEl) {
      mountLineChart(chartEl, {
        series: [
          { key: 'revenue', label: 'Doanh thu' },
          { key: 'cost', label: state.includePayroll ? 'Chi phí (gồm lương)' : 'Chi phí' },
          { key: 'profit', label: 'Lợi nhuận' },
        ],
        points: series,
        label: (k) => bucketLabel(k),
        longLabel: long,
      });
    }
  }

  function drawCustomers(panel) {
    const rows = state.data.by_customer;
    if (!rows.length) return setHtml(panel, emptyState('Không có khách nào phát sinh trong khoảng này'));
    setHtml(panel, html`<div class="space-y-3">
      <div class="flex justify-end">${exportBtn('customers')}</div>
      <div class="table-wrap overflow-x-auto"><table class="table">
        <thead><tr><th>Khách</th><th class="text-right">Số đơn</th><th class="text-right">Doanh thu</th><th class="text-right">Đã thu</th><th class="text-right">Còn nợ</th></tr></thead>
        <tbody>${rows.map((c) => html`<tr>
          <td><a class="font-medium text-fg hover:underline" href="#/khach-hang/${c.id}/cong-no">${c.name}</a></td>
          <td class="text-right tabular-nums">${c.order_count}</td>
          <td class="text-right font-semibold tabular-nums">${formatVND(c.revenue)}</td>
          <td class="text-right tabular-nums">${formatVND(c.collected)}</td>
          <td class="text-right tabular-nums ${c.debt > 0 ? 'text-warn' : c.debt < 0 ? 'text-good' : 'text-subtle'}">${signed(c.debt)}</td>
        </tr>`)}</tbody>
      </table></div>
      <p class="text-xs text-subtle">Còn nợ tính đến ${formatDateStr(state.data.range.to)}; số âm là khách trả dư.</p>
    </div>`);
  }

  function drawProducts(panel) {
    const rows = state.data.by_product;
    if (!rows.length) return setHtml(panel, emptyState('Chưa bán sản phẩm nào trong khoảng này'));
    const total = rows.reduce((s, r) => s + Number(r.revenue), 0);
    setHtml(panel, html`<div class="space-y-3">
      <div class="flex justify-end">${exportBtn('products')}</div>
      <div class="table-wrap overflow-x-auto"><table class="table">
        <thead><tr><th>Sản phẩm</th><th class="text-right">Số lượng bán</th><th class="text-right">Doanh thu</th><th class="text-right">Tỷ trọng</th></tr></thead>
        <tbody>${rows.map((p) => html`<tr>
          <td class="font-medium text-fg">${p.name}</td>
          <td class="text-right tabular-nums">${qtyText(p.quantity)} <span class="text-xs text-subtle">${p.unit}</span></td>
          <td class="text-right font-semibold tabular-nums">${formatVND(p.revenue)}</td>
          <td class="text-right text-muted tabular-nums">${String(total ? Math.round((p.revenue / total) * 1000) / 10 : 0).replace('.', ',')}%</td>
        </tr>`)}</tbody>
      </table></div>
    </div>`);
  }

  function exportCSV(kind) {
    const d = state.data;
    const suffix = `${d.range.from}_${d.range.to}`;
    if (kind === 'total') {
      const csv = toCSV(d.series, [
        { label: d.granularity === 'day' ? 'Ngày' : 'Tháng', value: (p) => bucketLabel(p.key, true) },
        { key: 'revenue', label: 'Doanh thu' },
        { key: 'expenses', label: 'Chi phí' },
        { key: 'payroll', label: 'Lương' },
        { key: 'profit', label: 'Lợi nhuận' },
      ]);
      downloadText(`bao-cao-tong_${suffix}.csv`, csv);
    } else if (kind === 'customers') {
      const csv = toCSV(d.by_customer, [
        { key: 'name', label: 'Khách' },
        { key: 'order_count', label: 'Số đơn' },
        { key: 'revenue', label: 'Doanh thu' },
        { key: 'collected', label: 'Đã thu' },
        { key: 'debt', label: 'Còn nợ' },
      ]);
      downloadText(`bao-cao-theo-khach_${suffix}.csv`, csv);
    } else {
      const csv = toCSV(d.by_product, [
        { key: 'name', label: 'Sản phẩm' },
        { key: 'unit', label: 'Đơn vị' },
        { label: 'Số lượng', value: (p) => qtyText(p.quantity) },
        { key: 'revenue', label: 'Doanh thu' },
      ]);
      downloadText(`bao-cao-theo-san-pham_${suffix}.csv`, csv);
    }
  }

  section.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !state.data) return;
    if (b.dataset.tab && b.dataset.tab !== state.tab) {
      state.tab = b.dataset.tab;
      draw();
    } else if (b.matches('[data-toggle-table]')) {
      state.asTable = !state.asTable;
      draw();
    } else if (b.dataset.export) exportCSV(b.dataset.export);
  });
  $('[data-payroll]', section).addEventListener('change', (ev) => {
    state.includePayroll = ev.target.checked;
    load();
  });
  const filter = mountRangeFilter($('[data-range]', section), { initial: 'month', onChange: (r) => { state.range = r; load(); } });
  state.range = filter.get();
  load();
}
