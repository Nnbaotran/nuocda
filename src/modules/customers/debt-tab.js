// Thẻ "Công nợ": nợ đầu kỳ, phát sinh tăng (đơn ghi nợ), phát sinh giảm (khách trả), nợ cuối kỳ
// theo khoảng ngày; ghi nhận khách trả nợ; huỷ phiếu thu nhập nhầm.
import { formatDateStr, todayVN } from '../../lib/dates.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { formatSignedVND, formatVND, groupThousands } from '../../lib/format.js';
import { mountRangeFilter } from '../../lib/range-filter.js';
import { bindMoneyInputs, emptyState, statCard, errorState, icon, loadingState, moneyValue, openModal, promptReason, showFieldErrors, toast } from '../../lib/ui.js';
import { cancelPayment, customerBalances, customerLedger, recordPayment } from '../orders/api.js';
import { balanceLabel, buildLedger } from '../orders/logic.js';
import { setOpeningDebt } from './api.js';
import { openingDebtFields, readOpeningDebt } from './forms.js';

const TONE = { debt: 'text-warn', credit: 'text-good', clear: 'text-good' };

export function renderDebtTab(panel, { customer }) {
  let range = null;
  let balance = 0;

  setHtml(
    panel,
    html`<div class="space-y-4">
      <div class="card flex flex-wrap items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-muted">Công nợ hiện tại</p>
          <p class="text-2xl font-bold tabular-nums" data-balance>…</p>
        </div>
        <button class="btn-primary" data-pay>${icon('wallet', 'size-4')} Khách trả nợ</button>
        <div class="flex w-full items-center justify-between gap-2 border-t border-fg/10 pt-3 text-sm">
          <span class="text-muted">Nợ cũ (trước khi dùng app): <strong class="text-fg tabular-nums" data-opening-amt></strong></span>
          <button class="font-medium text-accent-ink hover:underline" data-edit-opening>Sửa nợ cũ</button>
        </div>
      </div>
      <div data-range></div>
      <div data-ledger>${loadingState(3)}</div>
    </div>`,
  );
  const ledgerEl = $('[data-ledger]', panel);
  const showOpening = () => {
    const a = Number(customer.opening_debt) || 0;
    $('[data-opening-amt]', panel).textContent = a
      ? `${formatVND(a)}${customer.opening_debt_date ? ` (đến ${formatDateStr(customer.opening_debt_date)})` : ''}`
      : 'Không có';
  };
  showOpening();

  async function loadBalance() {
    try {
      balance = (await customerBalances()).get(customer.id) ?? 0;
      const l = balanceLabel(balance);
      const el = $('[data-balance]', panel);
      el.textContent = l.text;
      el.className = `text-2xl font-bold tabular-nums ${TONE[l.tone]}`;
    } catch {
      /* phần sổ bên dưới sẽ báo lỗi */
    }
  }

  async function loadLedger() {
    setHtml(ledgerEl, loadingState(3));
    try {
      const data = await customerLedger(customer.id, range.from, range.to);
      drawLedger(buildLedger(data.opening, data.entries));
    } catch (err) {
      setHtml(ledgerEl, errorState(err.message, loadLedger));
    }
  }

  function drawLedger(l) {
    setHtml(
      ledgerEl,
      html`<div class="space-y-4">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          ${statCard('Nợ đầu kỳ', formatSignedVND(l.opening))}
          ${statCard('Phát sinh tăng', `+${formatVND(l.increase)}`, { cls: 'text-warn' })}
          ${statCard('Phát sinh giảm', `−${formatVND(l.decrease)}`, { cls: 'text-good' })}
          ${statCard('Nợ cuối kỳ', formatSignedVND(l.closing), { cls: l.closing > 0 ? 'text-warn' : 'text-good' })}
        </div>
        ${l.rows.length === 0
          ? emptyState('Không có phát sinh trong khoảng ngày này')
          : html`<ul class="divide-y divide-fg/5 overflow-hidden rounded-2xl border border-fg/10 bg-surface/70">
              ${l.rows.map(
                (r) => html`<li class="flex items-start gap-3 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-xs text-subtle">${formatDateStr(r.date)}</p>
                    ${r.kind === 'opening'
                      ? html`<p class="font-medium text-fg">Nợ cũ</p><p class="text-xs text-subtle">Khách nợ từ trước khi dùng app</p>`
                      : r.kind === 'order'
                      ? html`<p class="font-medium text-fg">Đơn <a class="text-accent-ink hover:underline" href="#/don-hang/${r.id}">${r.code}</a></p>
                          <p class="text-xs text-subtle">Tổng ${formatVND(r.total)} · đã trả ${formatVND(r.paid)}</p>`
                      : html`<p class="font-medium text-fg">Khách trả nợ</p>
                          ${r.note ? html`<p class="text-xs text-subtle">${r.note}</p>` : ''}`}
                  </div>
                  <div class="text-right">
                    <p class="font-semibold tabular-nums ${r.increase ? 'text-warn' : 'text-good'}">
                      ${r.increase ? `+${formatVND(r.increase)}` : `−${formatVND(r.decrease)}`}
                    </p>
                    <p class="text-xs text-subtle tabular-nums">Dư: ${formatSignedVND(r.balance)}</p>
                    ${r.kind === 'payment' ? html`<button class="mt-1 text-xs text-bad hover:underline" data-cancel-pay="${r.id}" data-amount="${r.decrease}">Huỷ phiếu</button>` : ''}
                  </div>
                </li>`,
              )}
            </ul>`}
      </div>`,
    );
  }

  function openPayment() {
    const today = todayVN();
    const { el } = openModal({
      title: 'Ghi nhận khách trả nợ',
      submitLabel: 'Lưu',
      body: html`<div class="space-y-4">
        <p class="text-sm text-muted">${customer.name} – ${balanceLabel(balance).text}</p>
        <div>
          <label class="field-label" for="pay-amount">Số tiền trả (₫) *</label>
          <div class="flex gap-2">
            <input class="input flex-1 text-right text-lg font-semibold tabular-nums" id="pay-amount" name="amount" data-money inputmode="numeric" required />
            ${balance > 0 ? html`<button type="button" class="btn-secondary" data-all>Trả hết</button>` : ''}
          </div>
          <p class="field-error hidden" data-error-for="amount"></p>
        </div>
        <div>
          <label class="field-label" for="pay-date">Ngày trả</label>
          <input class="input" id="pay-date" name="paidOn" type="date" value="${today}" max="${today}" />
          <p class="field-error hidden" data-error-for="paidOn"></p>
        </div>
        <div>
          <label class="field-label" for="pay-note">Ghi chú</label>
          <input class="input" id="pay-note" name="note" maxlength="300" placeholder="VD: chuyển khoản, tiền mặt…" />
        </div>
      </div>`,
      onSubmit: async (form) => {
        const amount = moneyValue(form.elements.amount);
        const paidOn = form.elements.paidOn.value;
        const errors = {};
        if (!amount || amount <= 0) errors.amount = 'Nhập số tiền lớn hơn 0';
        else if (amount > balance) errors.amount = `Lớn hơn số nợ hiện tại (${formatVND(Math.max(balance, 0))})`;
        if (!paidOn || paidOn > today) errors.paidOn = 'Chọn ngày, không được ở tương lai';
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) return false;
        await recordPayment({ customerId: customer.id, amount, paidOn, note: form.elements.note.value.trim() });
        toast(`Đã ghi nhận khách trả ${formatVND(amount)}`);
        refreshAll();
      },
    });
    bindMoneyInputs(el);
    el.querySelector('[data-all]')?.addEventListener('click', () => {
      el.querySelector('[name=amount]').value = groupThousands(balance);
    });
  }

  async function onCancelPayment(id, amount) {
    const reason = await promptReason({
      title: 'Huỷ phiếu thu',
      message: `Huỷ khoản khách trả ${formatVND(amount)}? Số này sẽ được cộng lại vào công nợ của khách.`,
      confirmLabel: 'Huỷ phiếu thu',
    });
    if (reason === null) return;
    try {
      await cancelPayment(id, reason);
      toast('Đã huỷ phiếu thu');
      refreshAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openEditOpening() {
    const { el } = openModal({
      title: 'Sửa nợ cũ',
      submitLabel: 'Lưu',
      body: html`<div class="space-y-3">
        <p class="text-sm text-muted">${customer.name}. Nợ cũ là số khách còn nợ từ trước khi dùng app (không tính các đơn trong app).</p>
        ${openingDebtFields(Number(customer.opening_debt) || 0, customer.opening_debt_date)}
      </div>`,
      onSubmit: async (form) => {
        const { errors, amount, date } = readOpeningDebt(form);
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) return false;
        await setOpeningDebt(customer.id, amount, date);
        customer.opening_debt = amount;
        customer.opening_debt_date = date;
        showOpening();
        toast(amount ? `Đã lưu nợ cũ ${formatVND(amount)}` : 'Đã bỏ nợ cũ');
        refreshAll();
      },
    });
    bindMoneyInputs(el);
  }

  function refreshAll() {
    loadBalance();
    loadLedger();
  }

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-pay]')) openPayment();
    if (e.target.closest('[data-edit-opening]')) openEditOpening();
    const c = e.target.closest('[data-cancel-pay]');
    if (c) onCancelPayment(c.dataset.cancelPay, Number(c.dataset.amount));
  });

  const filter = mountRangeFilter($('[data-range]', panel), {
    initial: 'month',
    onChange: (r) => {
      range = r;
      loadLedger();
    },
  });
  range = filter.get();
  refreshAll();
}
