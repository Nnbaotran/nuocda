// Thành phần giao diện dùng chung: thông báo, hộp thoại, trạng thái tải/trống/lỗi, ô nhập tiền.
import { $, html, raw, setHtml, toNode } from './dom.js';
import { groupThousands, parseMoney } from './format.js';

// ---- Biểu tượng (SVG nét mảnh) ---------------------------------------
const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  receipt: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5',
  id: 'M3 5h18v14H3zM7 15h4M7 11h2M15 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 15h4',
  calendar: 'M3 6h18v15H3zM3 10h18M8 3v4M16 3v4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13h2',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7zM16 10h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  alert: 'M12 3 2 21h20zM12 10v5M12 18h.01',
  check: 'M5 12l5 5L20 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  refresh: 'M20 11a8 8 0 1 0-2 5.3M20 4v7h-7',
};

export function icon(name, cls = 'size-5') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name] ?? ''}"/></svg>`,
  );
}

// ---- Thông báo nhỏ (toast) --------------------------------------------
export function toast(message, type = 'success') {
  let box = $('#toasts');
  if (!box) {
    box = toNode(html`<div id="toasts" class="toast-stack" role="status" aria-live="polite"></div>`);
    document.body.append(box);
  }
  const tone = type === 'error' ? 'toast-error' : 'toast-success';
  const el = toNode(html`<div class="toast ${tone}">${icon(type === 'error' ? 'alert' : 'check', 'size-5 shrink-0')}<span>${message}</span></div>`);
  box.append(el);
  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 5000 : 2800);
}

// ---- Hộp thoại (modal) --------------------------------------------------
/**
 * Mở hộp thoại. body: template html. onSubmit(form) trả về true/undefined để đóng, false để giữ.
 * Trả về { el, close }.
 */
export function openModal({ title, body, submitLabel = 'Lưu', onSubmit, danger = false, wide = false }) {
  const el = toNode(html`
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${title}">
      ${raw(onSubmit ? '<form' : '<div')} class="modal-panel ${wide ? 'md:max-w-2xl' : ''}" novalidate>
        <header class="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 class="text-lg font-semibold text-white">${title}</h2>
          <button type="button" class="btn-icon" data-close aria-label="Đóng">${icon('x')}</button>
        </header>
        <div class="max-h-[70dvh] overflow-y-auto px-5 py-4">${body}</div>
        <p class="form-error mx-5 hidden" data-form-error></p>
        <footer class="flex gap-3 border-t border-white/10 px-5 py-4">
          <button type="button" class="btn-secondary flex-1" data-close>Huỷ</button>
          ${onSubmit ? html`<button type="submit" class="${danger ? 'btn-danger' : 'btn-primary'} flex-1" data-submit>${submitLabel}</button>` : ''}
        </footer>
      ${raw(onSubmit ? '</form>' : '</div>')}
    </div>`);
  // Hộp thoại không có nút Lưu thì không bọc <form>, để bên trong chứa được form khác.
  const form = $('.modal-panel', el);
  const errBox = $('[data-form-error]', el);
  const prevFocus = document.activeElement;

  const close = () => {
    el.classList.add('opacity-0');
    setTimeout(() => el.remove(), 150);
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) close();
  });

  if (onSubmit) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[data-submit]', el);
    errBox.classList.add('hidden');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Đang lưu…';
    try {
      const result = await onSubmit(form);
      if (result !== false) close();
    } catch (err) {
      showFormError(form, err?.message || 'Có lỗi xảy ra, vui lòng thử lại');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  document.body.append(el);
  requestAnimationFrame(() => $('input,select,textarea', el)?.focus());
  return { el, close };
}

export function showFormError(form, message) {
  const box = $('[data-form-error]', form.closest('.modal-backdrop') ?? form);
  if (!box) return toast(message, 'error');
  box.textContent = message;
  box.classList.remove('hidden');
}

/** Hỏi xác nhận, trả về Promise<boolean>. */
export function confirmDialog({ title = 'Xác nhận', message, confirmLabel = 'Đồng ý', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    const { el } = openModal({
      title,
      body: html`<p class="text-slate-300">${message}</p>`,
      submitLabel: confirmLabel,
      danger,
      onSubmit: () => {
        answered = true;
        resolve(true);
      },
    });
    new MutationObserver((_, obs) => {
      if (!el.isConnected) {
        obs.disconnect();
        if (!answered) resolve(false);
      }
    }).observe(document.body, { childList: true });
  });
}

/** Hỏi xác nhận kèm ô nhập lý do. Trả về Promise<string|null> (null = bấm Huỷ). */
export function promptReason({ title, message, confirmLabel = 'Đồng ý', placeholder = 'Lý do (không bắt buộc)' }) {
  return new Promise((resolve) => {
    let answered = false;
    const { el } = openModal({
      title,
      danger: true,
      submitLabel: confirmLabel,
      body: html`<div class="space-y-3">
        <p class="text-slate-300">${message}</p>
        <input class="input" name="reason" maxlength="300" placeholder="${placeholder}" />
      </div>`,
      onSubmit: (form) => {
        answered = true;
        resolve(form.elements.reason.value.trim());
      },
    });
    new MutationObserver((_, obs) => {
      if (!el.isConnected) {
        obs.disconnect();
        if (!answered) resolve(null);
      }
    }).observe(document.body, { childList: true });
  });
}

// ---- Trạng thái tải / trống / lỗi --------------------------------------
export function loadingState(rows = 3) {
  return html`<div class="space-y-3" aria-busy="true" aria-label="Đang tải">
    ${Array.from({ length: rows }, () => html`<div class="skeleton h-16"></div>`)}
  </div>`;
}

export function emptyState(message, actionHtml = '') {
  return html`<div class="card flex flex-col items-center gap-3 py-12 text-center">
    <div class="grid size-12 place-items-center rounded-2xl bg-white/5 text-slate-400">${icon('box', 'size-6')}</div>
    <p class="text-slate-400">${message}</p>
    ${actionHtml}
  </div>`;
}

export function errorState(message, onRetry) {
  const id = `retry-${Math.random().toString(36).slice(2)}`;
  queueMicrotask(() => document.getElementById(id)?.addEventListener('click', onRetry));
  return html`<div class="card flex flex-col items-center gap-3 border-rose-500/30 py-10 text-center">
    <div class="grid size-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-400">${icon('alert', 'size-6')}</div>
    <p class="text-rose-200">${message}</p>
    ${onRetry ? html`<button id="${id}" class="btn-secondary">${icon('refresh', 'size-4')} Thử lại</button>` : ''}
  </div>`;
}

// ---- Ô nhập tiền: tự thêm dấu chấm khi gõ ------------------------------
export function bindMoneyInputs(root) {
  for (const input of root.querySelectorAll('input[data-money]')) {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      input.value = digits ? groupThousands(Number(digits)) : '';
    });
  }
}

export function moneyValue(input) {
  return parseMoney(input.value);
}

/** Hiện lỗi dưới từng ô nhập: errors = { tenTruong: 'thông báo' } */
export function showFieldErrors(form, errors) {
  for (const el of form.querySelectorAll('[data-error-for]')) {
    const msg = errors[el.dataset.errorFor];
    el.textContent = msg ?? '';
    el.classList.toggle('hidden', !msg);
    const input = form.elements[el.dataset.errorFor];
    input?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const first = Object.keys(errors)[0];
  if (first) form.elements[first]?.focus();
}

export { setHtml };
