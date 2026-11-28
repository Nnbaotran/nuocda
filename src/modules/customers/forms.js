// Hộp thoại: thông tin khách (tạo/sửa) và "Cấu hình giá lần đầu".
import { html } from '../../lib/dom.js';
import { todayVN } from '../../lib/dates.js';
import { groupThousands } from '../../lib/format.js';
import { bindMoneyInputs, moneyValue, openModal, showFieldErrors, showFormError, toast } from '../../lib/ui.js';
import { listProducts } from '../products/api.js';
import { createCustomer, updateCustomer } from './api.js';
import { buildPriceRows, CUSTOMER_LIMITS, diffPrices, validateCustomer } from './logic.js';
import { bindPriceTable, priceTable, readPriceEdits, showPriceErrors } from './price-table.js';

function infoFields(c) {
  return html`<div class="space-y-4">
    <div>
      <label class="field-label" for="cf-name">Tên khách *</label>
      <input class="input" id="cf-name" name="name" maxlength="${CUSTOMER_LIMITS.nameMax}" value="${c.name}" required placeholder="VD: Quán cà phê Cô Ba" />
      <p class="field-error hidden" data-error-for="name"></p>
    </div>
    <div>
      <label class="field-label" for="cf-phone">Số điện thoại</label>
      <input class="input" id="cf-phone" name="phone" type="tel" inputmode="tel" maxlength="${CUSTOMER_LIMITS.phoneMax}" value="${c.phone}" />
      <p class="field-error hidden" data-error-for="phone"></p>
    </div>
    <div>
      <label class="field-label" for="cf-address">Địa chỉ</label>
      <input class="input" id="cf-address" name="address" maxlength="${CUSTOMER_LIMITS.addressMax}" value="${c.address}" />
      <p class="field-error hidden" data-error-for="address"></p>
    </div>
    <div>
      <label class="field-label" for="cf-note">Ghi chú</label>
      <textarea class="input" id="cf-note" name="note" rows="2" maxlength="${CUSTOMER_LIMITS.noteMax}">${c.note}</textarea>
      <p class="field-error hidden" data-error-for="note"></p>
    </div>
  </div>`;
}

/** Ô "Nợ cũ" – chỉ hiện khi tạo khách mới. */
export function openingDebtFields(amount, date) {
  const today = todayVN();
  return html`<div class="space-y-3 rounded-2xl border border-warn/30 bg-warn/5 p-3">
    <div>
      <label class="field-label" for="cf-debt">Nợ cũ (₫) – khách còn nợ từ trước khi dùng app</label>
      <input class="input text-right text-lg font-semibold tabular-nums" id="cf-debt" name="openingDebt" data-money inputmode="numeric"
        value="${amount ? groupThousands(amount) : ''}" placeholder="0 = không nợ" />
      <p class="field-error hidden" data-error-for="openingDebt"></p>
    </div>
    <div>
      <label class="field-label" for="cf-debt-date">Nợ tính đến ngày</label>
      <input class="input" id="cf-debt-date" name="openingDate" type="date" value="${date || today}" max="${today}" />
      <p class="field-error hidden" data-error-for="openingDate"></p>
    </div>
  </div>`;
}

/** Đọc + kiểm tra ô nợ cũ. */
export function readOpeningDebt(form) {
  const raw = form.elements.openingDebt.value.trim();
  const amount = raw ? moneyValue(form.elements.openingDebt) : 0;
  const date = form.elements.openingDate.value;
  const errors = {};
  if (amount === null || Number.isNaN(amount) || amount < 0) errors.openingDebt = 'Số tiền không hợp lệ';
  else if (amount > 1e12) errors.openingDebt = 'Số tiền quá lớn';
  if (!date || date > todayVN()) errors.openingDate = 'Chọn ngày, không được ở tương lai';
  return { errors, amount: amount || 0, date };
}

function readInfo(form) {
  const f = form.elements;
  return validateCustomer({ name: f.name.value, phone: f.phone.value, address: f.address.value, note: f.note.value });
}

/** Sửa thông tin khách đã có. */
export function openEditCustomer(customer, onSaved) {
  openModal({
    title: 'Sửa thông tin khách',
    body: infoFields(customer),
    onSubmit: async (form) => {
      const { ok, value, errors } = readInfo(form);
      showFieldErrors(form, errors);
      if (!ok) return false;
      await updateCustomer(customer.id, value);
      toast('Đã lưu thông tin khách');
      onSaved?.();
    },
  });
}

/**
 * Tạo khách mới: Bước 1 nhập thông tin -> Bước 2 popup "Cấu hình giá lần đầu"
 * (mọi sản phẩm, điền sẵn giá chung). Chỉ khi bấm Lưu ở bước 2 mới tạo hồ sơ.
 */
export function openCreateCustomer(onCreated, draft = { name: '', phone: '', address: '', note: '', openingDebt: 0, openingDate: '' }) {
  const { el } = openModal({
    title: 'Thêm khách – Bước 1/2: Thông tin',
    submitLabel: 'Tiếp: cấu hình giá',
    body: html`<div class="space-y-4">${infoFields(draft)}${openingDebtFields(draft.openingDebt, draft.openingDate)}</div>`,
    onSubmit: async (form) => {
      const { ok, value, errors } = readInfo(form);
      const debt = readOpeningDebt(form);
      Object.assign(errors, debt.errors);
      showFieldErrors(form, errors);
      if (!ok || Object.keys(debt.errors).length) return false;
      value.openingDebt = debt.amount;
      value.openingDate = debt.date;
      let products;
      try {
        products = await listProducts();
      } catch (err) {
        showFormError(form, err.message);
        return false;
      }
      // Mở bước 2 sau khi hộp thoại bước 1 đóng hẳn
      setTimeout(() => openFirstPrices(value, products, onCreated), 160);
    },
  });
  bindMoneyInputs(el);
}

function openFirstPrices(info, products, onCreated) {
  const rows = buildPriceRows(products, []);
  const { el, close } = openModal({
    title: 'Bước 2/2: Cấu hình giá lần đầu',
    submitLabel: 'Lưu & tạo hồ sơ',
    wide: true,
    body: html`<div class="space-y-3">
      <p class="text-sm text-muted">
        Giá riêng cho <strong class="text-fg">${info.name}</strong>. Đã điền sẵn giá chung, chỉ cần sửa sản phẩm có giá khác.
      </p>
      ${info.openingDebt ? html`<p class="text-sm text-warn">Nợ cũ: <strong class="tabular-nums">${groupThousands(info.openingDebt)} ₫</strong></p>` : ''}
      <div data-prices>${priceTable(rows, { editable: true })}</div>
      <button type="button" class="text-sm text-accent-ink underline-offset-4 hover:underline" data-back>← Quay lại sửa thông tin</button>
    </div>`,
    onSubmit: async () => {
      const box = el.querySelector('[data-prices]');
      const { ok, errors, changes } = diffPrices(rows, readPriceEdits(box));
      showPriceErrors(box, errors);
      if (!ok) return false;
      const id = await createCustomer(info, changes);
      toast('Đã tạo hồ sơ khách');
      onCreated?.(id);
    },
  });
  bindPriceTable(el);
  el.querySelector('[data-back]').addEventListener('click', () => {
    close();
    setTimeout(() => openCreateCustomer(onCreated, info), 160);
  });
}
