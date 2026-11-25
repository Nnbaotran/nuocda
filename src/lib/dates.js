// Ngày tháng theo giờ Việt Nam, dạng chuỗi 'yyyy-mm-dd' (không phụ thuộc múi giờ máy). Có test.

const TZ = 'Asia/Ho_Chi_Minh';

/** Ngày hôm nay ở Việt Nam: '2026-11-25' */
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUTCDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUTCDate(dt) {
  return dt.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const dt = toUTCDate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTCDate(dt);
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTCDate(toUTCDate(s)) === s;
}

/** '2026-11-25' -> '25/11/2026' */
export function formatDateStr(s) {
  if (!isDateStr(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Các khoảng ngày có sẵn. Trả về { from, to } (null = không giới hạn). */
export const PRESETS = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'lastmonth', label: 'Tháng trước' },
  { id: 'year', label: 'Năm nay' },
  { id: 'all', label: 'Tất cả' },
];

export function presetRange(id, today = todayVN()) {
  const [y, m] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  switch (id) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'lastmonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: addDays(`${y}-${pad(m)}-01`, -1) };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: null, to: null };
  }
}

/**
 * Đổi khoảng ngày VN thành mốc thời gian để lọc cột timestamptz:
 * { gte: '2026-11-01T00:00:00+07:00', lt: '2026-11-26T00:00:00+07:00' }
 */
export function rangeToTimestamps(from, to) {
  return {
    gte: from ? `${from}T00:00:00+07:00` : null,
    lt: to ? `${addDays(to, 1)}T00:00:00+07:00` : null,
  };
}

/** Giá trị cho <input type="datetime-local"> theo giờ VN: '2026-11-25T13:05' */
export function toLocalInputVN(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(date))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** '2026-11-25T13:05' (giờ VN) -> '2026-11-25T13:05:00+07:00' */
export function fromLocalInputVN(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : null;
}
