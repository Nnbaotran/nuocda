// Màn hình Sản phẩm: Chủ thêm/sửa/xoá/ngừng bán; Nhân viên chỉ xem.
import { UNIT_SUGGESTIONS } from '../../config.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { formatVND, groupThousands } from '../../lib/format.js';
import {
  bindMoneyInputs,
  confirmDialog,
  emptyState,
  errorState,
  icon,
  loadingState,
  openModal,
  showFieldErrors,
  toast,
} from '../../lib/ui.js';
import { isOwner } from '../auth/session.js';
import { createProduct, deleteProduct, listProducts, updateProduct } from './api.js';
import { PRODUCT_LIMITS, validateProduct } from './validate.js';

export function renderProducts(root) {
  const owner = isOwner();
  const state = { items: [], query: '', status: 'all' };

  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative min-w-0 flex-1 basis-56">
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">${icon('search', 'size-4')}</span>
          <input class="input pl-9" type="search" placeholder="Tìm theo tên hoặc mã…" data-search aria-label="Tìm sản phẩm" />
        </div>
        <select class="input w-auto" data-status aria-label="Lọc trạng thái">
          <option value="all">Tất cả</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Ngừng bán</option>
        </select>
        ${owner ? html`<button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm sản phẩm</button>` : ''}
      </div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );

  // Gắn sự kiện vào <section> (bị thay mới mỗi lần mở trang) để không bị gắn trùng.
  const section = $('section', root);
  const listEl = $('[data-list]', section);

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.items = await listProducts();
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.items.filter((p) => {
      if (state.status === 'active' && !p.is_active) return false;
      if (state.status === 'inactive' && p.is_active) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
    });
  }

  const statusBadge = (p) => (p.is_active ? html`<span class="badge-green">Đang bán</span>` : html`<span class="badge-gray">Ngừng bán</span>`);
  const actions = (p) =>
    owner
      ? html`<div class="flex justify-end gap-1">
          <button class="btn-icon" data-edit="${p.id}" aria-label="Sửa ${p.name}">${icon('edit')}</button>
          <button class="btn-icon hover:text-rose-400" data-delete="${p.id}" aria-label="Xoá ${p.name}">${icon('trash')}</button>
        </div>`
      : '';

  function draw() {
    const rows = filtered();
    if (state.items.length === 0) {
      return setHtml(
        listEl,
        emptyState('Chưa có sản phẩm nào', owner ? html`<button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm sản phẩm đầu tiên</button>` : ''),
      );
    }
    if (rows.length === 0) return setHtml(listEl, emptyState('Không có sản phẩm phù hợp bộ lọc'));

    setHtml(
      listEl,
      html`<p class="mb-2 text-xs text-slate-500">${rows.length} sản phẩm</p>
        <ul class="space-y-3 md:hidden">
          ${rows.map(
            (p) => html`<li class="card">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold text-white">${p.name}</p>
                  <p class="text-xs text-slate-500">${p.sku || 'Chưa có mã'} · ${p.unit}</p>
                </div>
                ${statusBadge(p)}
              </div>
              <div class="mt-3 flex items-center justify-between gap-3">
                <p class="text-lg font-semibold text-cyan-300">${formatVND(p.price)}<span class="text-xs font-normal text-slate-500"> / ${p.unit}</span></p>
                ${actions(p)}
              </div>
              ${p.note ? html`<p class="mt-2 text-sm text-slate-400">${p.note}</p>` : ''}
            </li>`,
          )}
        </ul>
        <div class="table-wrap hidden md:block">
          <table class="table">
            <thead><tr><th>Mã</th><th>Tên sản phẩm</th><th>Đơn vị</th><th class="text-right">Giá mặc định</th><th>Trạng thái</th><th>Ghi chú</th>${owner ? html`<th></th>` : ''}</tr></thead>
            <tbody>
              ${rows.map(
                (p) => html`<tr>
                  <td class="text-slate-400">${p.sku || '—'}</td>
                  <td class="font-medium text-white">${p.name}</td>
                  <td>${p.unit}</td>
                  <td class="text-right font-semibold text-cyan-300 tabular-nums">${formatVND(p.price)}</td>
                  <td>${statusBadge(p)}</td>
                  <td class="max-w-56 truncate text-slate-400" title="${p.note}">${p.note || '—'}</td>
                  ${owner ? html`<td>${actions(p)}</td>` : ''}
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`,
    );
  }

  function openForm(product) {
    const editing = Boolean(product);
    const p = product ?? { name: '', sku: '', unit: 'cây', price: 0, note: '', is_active: true };
    const { el } = openModal({
      title: editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm',
      submitLabel: editing ? 'Lưu thay đổi' : 'Thêm sản phẩm',
      body: html`<div class="space-y-4">
        <div>
          <label class="field-label" for="pf-name">Tên sản phẩm *</label>
          <input class="input" id="pf-name" name="name" maxlength="${PRODUCT_LIMITS.nameMax}" value="${p.name}" required />
          <p class="field-error hidden" data-error-for="name"></p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label" for="pf-sku">Mã (SKU)</label>
            <input class="input uppercase" id="pf-sku" name="sku" maxlength="${PRODUCT_LIMITS.skuMax}" value="${p.sku ?? ''}" placeholder="VD: DA-CAY" autocapitalize="characters" />
            <p class="field-error hidden" data-error-for="sku"></p>
          </div>
          <div>
            <label class="field-label" for="pf-unit">Đơn vị tính *</label>
            <input class="input" id="pf-unit" name="unit" list="pf-units" maxlength="${PRODUCT_LIMITS.unitMax}" value="${p.unit}" required />
            <datalist id="pf-units">${UNIT_SUGGESTIONS.map((u) => html`<option value="${u}"></option>`)}</datalist>
            <p class="field-error hidden" data-error-for="unit"></p>
          </div>
        </div>
        <div>
          <label class="field-label" for="pf-price">Giá mặc định (₫) *</label>
          <input class="input text-right text-lg font-semibold tabular-nums" id="pf-price" name="price" inputmode="numeric" data-money value="${groupThousands(p.price)}" required />
          <p class="field-error hidden" data-error-for="price"></p>
        </div>
        <div>
          <label class="field-label" for="pf-note">Ghi chú</label>
          <textarea class="input" id="pf-note" name="note" rows="2" maxlength="${PRODUCT_LIMITS.noteMax}">${p.note ?? ''}</textarea>
          <p class="field-error hidden" data-error-for="note"></p>
        </div>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3">
          <input type="checkbox" name="is_active" class="size-5 accent-cyan-400" ${p.is_active ? 'checked' : ''} />
          <span>Đang bán</span>
        </label>
      </div>`,
      onSubmit: async (form) => {
        const f = form.elements;
        const { ok, value, errors } = validateProduct({
          name: f.name.value,
          sku: f.sku.value,
          unit: f.unit.value,
          price: f.price.value,
          note: f.note.value,
          is_active: f.is_active.checked,
        });
        showFieldErrors(form, errors);
        if (!ok) return false;
        if (editing) await updateProduct(p.id, value);
        else await createProduct(value);
        toast(editing ? 'Đã lưu sản phẩm' : 'Đã thêm sản phẩm');
        load();
      },
    });
    bindMoneyInputs(el);
  }

  async function remove(product) {
    const ok = await confirmDialog({
      title: 'Xoá sản phẩm',
      message: `Xoá "${product.name}"? Nếu chỉ tạm thời không bán, nên chọn "Ngừng bán" thay vì xoá.`,
      confirmLabel: 'Xoá',
    });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      toast('Đã xoá sản phẩm');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  section.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !owner) return;
    if (t.matches('[data-add]')) openForm(null);
    const editId = t.dataset.edit;
    const delId = t.dataset.delete;
    if (editId) openForm(state.items.find((x) => x.id === editId));
    if (delId) remove(state.items.find((x) => x.id === delId));
  });
  $('[data-search]', section).addEventListener('input', (e) => {
    state.query = e.target.value;
    draw();
  });
  $('[data-status]', section).addEventListener('change', (e) => {
    state.status = e.target.value;
    draw();
  });

  load();
}
