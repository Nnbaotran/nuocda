// Hồ sơ khách: thông tin + 3 thẻ (Cấu hình sản phẩm & giá bán | Bán hàng | Công nợ).
import { $, html, setHtml } from '../../lib/dom.js';
import { confirmDialog, errorState, icon, loadingState, toast } from '../../lib/ui.js';
import { listProducts } from '../products/api.js';
import { deleteCustomer, getCustomer, getCustomerPrices, saveCustomerPrices, updateCustomer } from './api.js';
import { openEditCustomer } from './forms.js';
import { buildPriceRows, diffPrices } from './logic.js';
import { renderDebtTab } from './debt-tab.js';
import { bindPriceTable, priceTable, readPriceEdits, showPriceErrors } from './price-table.js';
import { renderSalesTab } from './sales-tab.js';

// id thẻ cũng là phần cuối địa chỉ: #/khach-hang/<mã>/ban-hang
const TABS = [
  { id: 'gia-ban', label: 'Giá bán' },
  { id: 'ban-hang', label: 'Bán hàng' },
  { id: 'cong-no', label: 'Công nợ' },
];

export function renderCustomerDetail(root, { params }) {
  const id = params.id;
  const state = { customer: null, rows: [], tab: TABS.some((t) => t.id === params.tab) ? params.tab : 'gia-ban', dirty: 0 };

  setHtml(root, html`<section class="space-y-4">
    <a href="#/khach-hang" class="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-fg">‹ Danh sách khách</a>
    <div data-body>${loadingState(2)}</div>
  </section>`);
  const section = $('section', root);
  const body = $('[data-body]', section);

  async function load() {
    setHtml(body, loadingState(2));
    try {
      const [customer, products, prices] = await Promise.all([getCustomer(id), listProducts(), getCustomerPrices(id)]);
      state.customer = customer;
      state.rows = buildPriceRows(products, prices);
      state.dirty = 0;
      draw();
    } catch (err) {
      setHtml(body, errorState(err.message, load));
    }
  }

  function header(c) {
    return html`<div class="card relative overflow-hidden">
      <div class="pointer-events-none absolute -top-20 -right-12 size-48 rounded-full bg-accent/15 blur-3xl"></div>
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 class="text-xl font-bold text-fg">${c.name}</h2>
          <div class="mt-1 space-y-0.5 text-sm text-muted">
            ${c.phone ? html`<p><a class="text-accent-ink hover:underline" href="tel:${c.phone.replace(/[^0-9+]/g, '')}">${c.phone}</a></p>` : ''}
            ${c.address ? html`<p>${c.address}</p>` : ''}
            ${c.note ? html`<p class="text-subtle italic">${c.note}</p>` : ''}
          </div>
        </div>
        ${c.is_active ? html`<span class="badge-green">Đang giao dịch</span>` : html`<span class="badge-gray">Ngừng giao dịch</span>`}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn-secondary flex-1" data-edit>${icon('edit', 'size-4')} Sửa</button>
        <button class="btn-secondary flex-1" data-toggle>${c.is_active ? 'Ngừng giao dịch' : 'Giao dịch lại'}</button>
        <button class="btn-secondary hover:text-bad" data-delete aria-label="Xoá hồ sơ">${icon('trash', 'size-4')}</button>
      </div>
    </div>`;
  }

  function tabPanel() {
    if (state.tab === 'gia-ban') {
      return html`<div class="space-y-3">
        <p class="text-sm text-muted">Giá riêng của khách này. Đổi ở đây không ảnh hưởng khách khác hay giá chung.</p>
        <div data-prices>${priceTable(state.rows, { editable: true })}</div>
        <div class="sticky bottom-20 z-10 hidden md:bottom-4" data-savebar>
          <div class="flex items-center gap-3 rounded-2xl border border-accent/30 bg-field/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
            <p class="flex-1 text-sm text-accent-ink" data-dirty-text></p>
            <button class="btn-secondary" data-undo>Hoàn tác</button>
            <button class="btn-primary" data-save>Lưu giá</button>
          </div>
        </div>
      </div>`;
    }
    return ''; // thẻ Bán hàng / Công nợ được vẽ sau (xem draw)
  }

  function draw() {
    const c = state.customer;
    setHtml(body, html`<div class="space-y-4">
      ${header(c)}
      <div class="flex gap-1 rounded-2xl border border-fg/10 bg-surface/70 p-1" role="tablist" aria-label="Thẻ hồ sơ khách">
        ${TABS.map((t) => html`<button role="tab" class="min-h-11 flex-1 rounded-xl text-sm font-medium transition ${t.id === state.tab ? 'bg-gradient-to-r from-accent/15 to-accent/5 text-fg ring-1 ring-accent/30' : 'text-muted hover:text-fg'}" aria-selected="${t.id === state.tab ? 'true' : 'false'}" data-tab="${t.id}">${t.label}</button>`)}
      </div>
      <div class="fade-in" role="tabpanel" data-panel>${tabPanel()}</div>
    </div>`);
    const panel = $('[data-panel]', body);
    if (state.tab === 'gia-ban') bindPrices();
    else if (state.tab === 'ban-hang') renderSalesTab(panel, { customer: c, priceRows: state.rows });
    else renderDebtTab(panel, { customer: c });
  }

  function bindPrices() {
    const box = $('[data-prices]', body);
    const bar = $('[data-savebar]', body);
    bindPriceTable(box, (n) => {
      state.dirty = n;
      bar.classList.toggle('hidden', n === 0);
      $('[data-dirty-text]', bar).textContent = `Đã sửa ${n} giá, chưa lưu`;
    });
    $('[data-undo]', bar).addEventListener('click', () => {
      state.dirty = 0;
      draw();
    });
    $('[data-save]', bar).addEventListener('click', async (e) => {
      const { ok, errors, changes } = diffPrices(state.rows, readPriceEdits(box));
      showPriceErrors(box, errors);
      if (!ok) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Đang lưu…';
      try {
        await saveCustomerPrices(id, changes);
        toast('Đã lưu bảng giá');
        await load();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Lưu giá';
      }
    });
  }

  async function leaveDirtyOk() {
    if (!state.dirty) return true;
    return confirmDialog({ title: 'Giá chưa lưu', message: 'Bạn đã sửa giá nhưng chưa bấm Lưu. Bỏ các thay đổi này?', confirmLabel: 'Bỏ thay đổi' });
  }

  section.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !state.customer) return;
    const c = state.customer;
    if (b.dataset.tab && b.dataset.tab !== state.tab) {
      if (!(await leaveDirtyOk())) return;
      state.tab = b.dataset.tab;
      state.dirty = 0;
      history.replaceState(null, '', `#/khach-hang/${id}/${state.tab}`);
      draw();
    } else if (b.matches('[data-edit]')) {
      openEditCustomer(c, load);
    } else if (b.matches('[data-toggle]')) {
      const stop = c.is_active;
      if (!(await confirmDialog({ title: stop ? 'Ngừng giao dịch' : 'Giao dịch lại', message: stop ? `Ngừng giao dịch với "${c.name}"? Hồ sơ, giá và lịch sử vẫn được giữ.` : `Cho "${c.name}" giao dịch lại?`, confirmLabel: 'Đồng ý', danger: stop }))) return;
      try {
        await updateCustomer(c.id, { is_active: !stop });
        toast(stop ? 'Đã ngừng giao dịch' : 'Đã cho giao dịch lại');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (b.matches('[data-delete]')) {
      if (!(await confirmDialog({ title: 'Xoá hồ sơ khách', message: `Xoá hẳn hồ sơ "${c.name}" và bảng giá riêng? Không khôi phục được. Nếu chỉ tạm ngưng, hãy chọn "Ngừng giao dịch".`, confirmLabel: 'Xoá hẳn' }))) return;
      try {
        await deleteCustomer(c.id);
        toast('Đã xoá hồ sơ khách');
        location.hash = '#/khach-hang';
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  load();
}

