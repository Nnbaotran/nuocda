// Gọi database cho đơn hàng & công nợ. Mọi thao tác ghi đi qua hàm (RPC) để tiền không bị lệch.
import { rangeToTimestamps } from '../../lib/dates.js';
import { friendlyError, supabase } from '../../lib/supabase.js';

const ORDER_COLS = 'id, code, order_date, status, total, paid, note, cancel_reason, customer_id, customers(name)';

function fail(error, fallback) {
  throw new Error(friendlyError(error, fallback));
}

export async function createOrder({ customerId, items, paid, note, orderDate }) {
  const { data, error } = await supabase.rpc('create_order', {
    p_customer_id: customerId,
    p_items: items,
    p_paid: paid,
    p_note: note ?? '',
    p_order_date: orderDate ?? null,
  });
  if (error) fail(error, 'Không lưu được đơn hàng');
  return data; // { id, code, total, paid }
}

export async function updateOrder({ orderId, items, paid, note, orderDate }) {
  const { data, error } = await supabase.rpc('update_order', {
    p_order_id: orderId,
    p_items: items,
    p_paid: paid,
    p_note: note ?? '',
    p_order_date: orderDate ?? null,
  });
  if (error) fail(error, 'Không lưu được thay đổi của đơn');
  return data;
}

export async function cancelOrder(orderId, reason) {
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason ?? '' });
  if (error) fail(error, 'Không huỷ được đơn');
}

/** filters: { from, to ('yyyy-mm-dd' hoặc null), customerId, status ('active'|'cancelled'|'all') } */
export async function listOrders({ from, to, customerId, status = 'all', limit = 500 } = {}) {
  const { gte, lt } = rangeToTimestamps(from, to);
  let q = supabase.from('orders').select(ORDER_COLS).order('order_date', { ascending: false }).limit(limit);
  if (gte) q = q.gte('order_date', gte);
  if (lt) q = q.lt('order_date', lt);
  if (customerId) q = q.eq('customer_id', customerId);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) fail(error, 'Không tải được danh sách đơn');
  return data;
}

export async function getOrder(id) {
  const [o, items, logs] = await Promise.all([
    supabase.from('orders').select(`${ORDER_COLS}, created_at, cancelled_at`).eq('id', id).maybeSingle(),
    supabase.from('order_items').select('product_id, product_name, unit, quantity, unit_price, line_total, position').eq('order_id', id).order('position'),
    supabase.from('audit_logs').select('action, changes, created_at').eq('entity', 'order').eq('entity_id', id).order('created_at', { ascending: false }),
  ]);
  for (const r of [o, items, logs]) if (r.error) fail(r.error, 'Không tải được đơn hàng');
  if (!o.data) throw new Error('Không tìm thấy đơn hàng');
  return { ...o.data, items: items.data, logs: logs.data };
}

/** Sổ công nợ: { opening, entries } */
export async function customerLedger(customerId, from, to) {
  const { data, error } = await supabase.rpc('customer_ledger', { p_customer_id: customerId, p_from: from, p_to: to });
  if (error) fail(error, 'Không tải được sổ công nợ');
  return data;
}

export async function recordPayment({ customerId, amount, paidOn, note }) {
  const { data, error } = await supabase.rpc('record_payment', {
    p_customer_id: customerId,
    p_amount: amount,
    p_paid_on: paidOn ?? null,
    p_note: note ?? '',
  });
  if (error) fail(error, 'Không ghi nhận được khoản trả nợ');
  return data;
}

export async function cancelPayment(paymentId, reason) {
  const { error } = await supabase.rpc('cancel_payment', { p_payment_id: paymentId, p_reason: reason ?? '' });
  if (error) fail(error, 'Không huỷ được phiếu thu');
}

/** Công nợ hiện tại của mọi khách: Map(customer_id -> số dư) */
export async function customerBalances() {
  const { data, error } = await supabase.from('customer_balances').select('customer_id, balance');
  if (error) fail(error, 'Không tải được công nợ');
  return new Map(data.map((r) => [r.customer_id, Number(r.balance)]));
}
