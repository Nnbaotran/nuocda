// Định dạng tiền VND và ngày tháng kiểu Việt Nam. Không phụ thuộc trình duyệt (test được bằng Node).

const TZ = 'Asia/Ho_Chi_Minh';

/** 1234567 -> "1.234.567" */
export function groupThousands(n) {
  const v = Math.trunc(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234567 -> "1.234.567 ₫" */
export function formatVND(n) {
  return `${groupThousands(n)} ₫`;
}

/**
 * Đọc số tiền người dùng gõ: "1.234.567", "1234567", "1 234 567 ₫" -> 1234567.
 * Trả về null nếu không hợp lệ (có số lẻ, chữ cái, rỗng...).
 */
export function parseMoney(text) {
  if (typeof text === 'number') return Number.isSafeInteger(text) ? text : null;
  const s = String(text ?? '').replace(/[\s.₫đ]/gi, '');
  if (!/^-?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isSafeInteger(v) ? v : null;
}

function parts(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return p;
}

/** -> "25/11/2026" (theo giờ Việt Nam) */
export function formatDate(date) {
  const p = parts(date);
  return p ? `${p.day}/${p.month}/${p.year}` : '';
}

/** -> "25/11/2026 13:05" (theo giờ Việt Nam) */
export function formatDateTime(date) {
  const p = parts(date);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : '';
}

/** Số lượng / số công kiểu Việt Nam: 2.5 -> "2,5"; 10 -> "10" */
export function formatQty(n) {
  return String(Number(n) || 0).replace('.', ',');
}

/** Tiền có dấu âm chuẩn: -100000 -> "−100.000 ₫" */
export function formatSignedVND(n) {
  const v = Number(n) || 0;
  return v < 0 ? `−${formatVND(-v)}` : formatVND(v);
}
