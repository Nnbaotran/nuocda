// Danh sách màn hình. "phase" = giai đoạn sẽ làm (màn hình chưa làm hiện thông báo "Sắp có").
// roles: ai được thấy trong menu. Quyền thật vẫn do database kiểm tra.
import { renderAccounts } from './modules/accounts/view.js';
import { renderHome } from './modules/home/view.js';
import { renderComingSoon } from './modules/placeholder/view.js';
import { renderProducts } from './modules/products/view.js';

const ALL = ['OWNER', 'STAFF'];
const OWNER = ['OWNER'];

export const ROUTES = [
  { path: '/', label: 'Tổng quan', icon: 'home', roles: ALL, render: renderHome, bottom: true },
  { path: '/khach-hang', label: 'Khách hàng', icon: 'users', roles: OWNER, phase: 2, bottom: true },
  { path: '/don-hang', label: 'Đơn hàng', icon: 'receipt', roles: ALL, phase: 3, bottom: true },
  { path: '/san-pham', label: 'Sản phẩm', icon: 'box', roles: ALL, render: renderProducts, bottom: true },
  { path: '/nhan-vien', label: 'Nhân viên & lương', icon: 'id', roles: OWNER, phase: 4 },
  { path: '/cham-cong', label: 'Chấm công & lương của tôi', icon: 'calendar', roles: ['STAFF'], phase: 4 },
  { path: '/chi-phi', label: 'Chi phí', icon: 'wallet', roles: OWNER, phase: 5 },
  { path: '/bao-cao', label: 'Báo cáo', icon: 'chart', roles: OWNER, phase: 5 },
  { path: '/tai-khoan', label: 'Tài khoản đăng nhập', icon: 'key', roles: OWNER, render: renderAccounts },
];

export function routesFor(role) {
  return ROUTES.filter((r) => r.roles.includes(role));
}

export function findRoute(path, role) {
  const r = routesFor(role).find((x) => x.path === path);
  if (!r) return null;
  return r.render ? r : { ...r, render: (el) => renderComingSoon(el, r) };
}
