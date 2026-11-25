// Tiện ích DOM nhỏ gọn. Mọi dữ liệu chèn vào HTML đều được "escape" để chống chèn mã độc.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const RAW = Symbol('raw');

/** Đánh dấu chuỗi HTML đã an toàn (do mình tự viết), không escape lại. */
export function raw(htmlString) {
  return { [RAW]: true, value: String(htmlString) };
}

function render(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && v[RAW]) return v.value;
  return escapeHtml(v);
}

/** Template an toàn: html`<p>${userText}</p>` -> tự escape userText. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return raw(out);
}

export function setHtml(el, tpl) {
  el.innerHTML = render(tpl);
  return el;
}

export function toNode(tpl) {
  const t = document.createElement('template');
  t.innerHTML = render(tpl).trim();
  return t.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
