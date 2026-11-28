// Logic thuần cho đơn hàng & công nợ (có test ở tests/orders.test.js).
// Database tính lại toàn bộ khi lưu; phần này để hiện số đúng ngay khi gõ và báo lỗi sớm.
import { formatVND } from '../../lib/format.js';

export const QTY_MAX = 100000;

/** Đọc số lượng: "10", "2,5", "2.5" -> số; tối đa 2 số lẻ. Trả về { value } hoặc { error }. */
export function parseQuantity(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (s === '') return { value: 0 };
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: 'Số lượng không hợp lệ' };
  const [, dec = ''] = s.split('.');
  if (dec.length > 2) return { error: 'Tối đa 2 số lẻ' };
  const value = Number(s);
  if (value > QTY_MAX) return { error: 'Số lượng quá lớn' };
  return { value };
}

/** Thành tiền = số lượng × đơn giá, làm tròn đến đồng (giống database). Dùng BigInt để không sai số. */
export function lineTotal(quantity, unitPrice) {
  const hundredths = BigInt(Math.round(Number(quantity) * 100));
  const total = (hundredths * BigInt(unitPrice) + 50n) / 100n;
  return Number(total);
}

/**
 * Sổ công nợ: từ nợ đầu kỳ + các dòng phát sinh -> số dư sau từng dòng và tổng kết.
 * entries: [{ increase, decrease, ... }] đã sắp theo ngày.
 */
export function buildLedger(opening, entries) {
  let balance = Number(opening) || 0;
  let increase = 0;
  let decrease = 0;
  const rows = entries.map((e) => {
    const inc = Number(e.increase) || 0;
    const dec = Number(e.decrease) || 0;
    increase += inc;
    decrease += dec;
    balance += inc - dec;
    return { ...e, increase: inc, decrease: dec, balance };
  });
  return { opening: Number(opening) || 0, increase, decrease, closing: balance, rows };
}

/** Diễn giải số dư: dương = còn nợ, 0 = hết nợ, âm = khách trả dư. */
export function balanceLabel(balance) {
  const b = Number(balance) || 0;
  if (b > 0) return { text: `Còn nợ ${formatVND(b)}`, tone: 'debt' };
  if (b < 0) return { text: `Khách trả dư ${formatVND(-b)}`, tone: 'credit' };
  return { text: 'Hết nợ', tone: 'clear' };
}

export const ORDER_STATUS = {
  active: { label: 'Hiệu lực', badge: 'badge-green' },
  cancelled: { label: 'Đã huỷ', badge: 'badge-gray' },
};
