// Danh sách màn hình. "phase" = giai đoạn sẽ làm (màn hình chưa làm hiện thông báo "Sắp có").
// roles: ai được vào. hidden: không hiện trong menu (trang con). nav: mục menu được tô sáng.
// Quyền thật vẫn do database kiểm tra.
import { matchPath } from './lib/router.js';
import { renderAccounts } from './modules/accounts/view.js';
import { renderCustomerDetail } from './modules/customers/detail-view.js';
import { renderCustomers } from './modules/customers/list-view.js';
import { renderHome } from './modules/home/view.js';
import { renderComingSoon } from './modules/placeholder/view.js';
import { renderProducts } from './modules/products/view.js';

const ALL = ['OWNER', 'STAFF'];
const OWNER = ['OWNER'];

export const ROUTES = [
  { path: '/', label: 'Tổng quan', icon: 'home', roles: ALL, render: renderHome, bottom: true },
  { path: '/khach-hang', label: 'Khách hàng', icon: 'users', roles: OWNER, render: renderCustomers, bottom: true },
  { path: '/khach-hang/:id', label: 'Hồ sơ khách', icon: 'users', roles: OWNER, render: renderCustomerDetail, hidden: true, nav: '/khach-hang' },
  { path: '/don-hang', label: 'Đơn hàng', icon: 'receipt', roles: ALL, phase: 3, bottom: true },
  { path: '/san-pham', label: 'Sản phẩm', icon: 'box', roles: ALL, render: renderProducts, bottom: true },
  { path: '/nhan-vien', label: 'Nhân viên & lương', icon: 'id', roles: OWNER, phase: 4 },
  { path: '/cham-cong', label: 'Chấm công & lương của tôi', icon: 'calendar', roles: ['STAFF'], phase: 4 },
  { path: '/chi-phi', label: 'Chi phí', icon: 'wallet', roles: OWNER, phase: 5 },
  { path: '/bao-cao', label: 'Báo cáo', icon: 'chart', roles: OWNER, phase: 5 },
  { path: '/tai-khoan', label: 'Tài khoản đăng nhập', icon: 'key', roles: OWNER, render: renderAccounts },
];

/** Các mục hiện trong menu cho vai trò này. */
export function routesFor(role) {
  return ROUTES.filter((r) => r.roles.includes(role) && !r.hidden);
}

/** Tìm màn hình cho đường dẫn; trả về null nếu không có hoặc vai trò không được vào. */
export function findRoute(path, role) {
  for (const r of ROUTES) {
    if (!r.roles.includes(role)) continue;
    const params = matchPath(r.path, path);
    if (!params) continue;
    const render = r.render ?? ((el) => renderComingSoon(el, r));
    return { ...r, params, render, navPath: r.nav ?? r.path };
  }
  return null;
}
