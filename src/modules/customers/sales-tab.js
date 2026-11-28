// Thẻ "Bán hàng" trong hồ sơ khách: dùng chung màn hình bán hàng POS (orders/pos.js).
import { mountCreatePos } from '../orders/pos-view.js';

export function renderSalesTab(panel, { customer }) {
  return mountCreatePos(panel, customer.id, { allowChangeCustomer: false });
}
