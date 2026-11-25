// Danh sách màn hình. Mỗi màn hình được TẢI KHI CẦN (lazy): mở trang nào mới tải mã của trang đó,
// nhờ vậy lần mở app đầu tiên nhẹ hơn nhiều. Quyền thật vẫn do database kiểm tra.
//   hidden: không hiện trong menu (trang con); nav: mục menu được tô sáng; bottom: có ở thanh dưới (điện thoại)
import { matchPath } from './lib/router.js';
import { renderHome } from './modules/home/view.js';

const OWNER = ['OWNER'];
const lazy = (load, name) => async (...args) => (await load())[name](...args);

const customersList = lazy(() => import('./modules/customers/list-view.js'), 'renderCustomers');
const customerDetail = lazy(() => import('./modules/customers/detail-view.js'), 'renderCustomerDetail');
const ordersList = lazy(() => import('./modules/orders/list-view.js'), 'renderOrders');
const orderDetail = lazy(() => import('./modules/orders/detail-view.js'), 'renderOrderDetail');
const products = lazy(() => import('./modules/products/view.js'), 'renderProducts');
const attendance = lazy(() => import('./modules/payroll/attendance-view.js'), 'renderAttendance');
const payroll = lazy(() => import('./modules/payroll/payroll-view.js'), 'renderPayroll');
const employees = lazy(() => import('./modules/payroll/employees-view.js'), 'renderEmployees');
const expenses = lazy(() => import('./modules/expenses/view.js'), 'renderExpenses');
const reports = lazy(() => import('./modules/reports/view.js'), 'renderReports');

const ROUTES = [
  { path: '/', label: 'Tổng quan', icon: 'home', roles: OWNER, render: renderHome, bottom: true },
  { path: '/khach-hang', label: 'Khách hàng', icon: 'users', roles: OWNER, render: customersList, bottom: true },
  { path: '/khach-hang/:id', label: 'Hồ sơ khách', icon: 'users', roles: OWNER, render: customerDetail, hidden: true, nav: '/khach-hang' },
  { path: '/khach-hang/:id/:tab', label: 'Hồ sơ khách', icon: 'users', roles: OWNER, render: customerDetail, hidden: true, nav: '/khach-hang' },
  { path: '/don-hang', label: 'Đơn hàng', icon: 'receipt', roles: OWNER, render: ordersList, bottom: true },
  { path: '/don-hang/:id', label: 'Chi tiết đơn', icon: 'receipt', roles: OWNER, render: orderDetail, hidden: true, nav: '/don-hang' },
  { path: '/san-pham', label: 'Sản phẩm', icon: 'box', roles: OWNER, render: products, bottom: true },
  { path: '/cham-cong', label: 'Chấm công', icon: 'calendar', roles: OWNER, render: attendance },
  { path: '/luong', label: 'Bảng lương', icon: 'cash', roles: OWNER, render: payroll },
  { path: '/nhan-vien', label: 'Nhân viên', icon: 'id', roles: OWNER, render: employees },
  { path: '/chi-phi', label: 'Chi phí', icon: 'wallet', roles: OWNER, render: expenses },
  { path: '/bao-cao', label: 'Báo cáo', icon: 'chart', roles: OWNER, render: reports },
];

/** Các mục hiện trong menu cho vai trò này. */
export function routesFor(role) {
  return ROUTES.filter((r) => r.roles.includes(role) && !r.hidden);
}

/** Tìm màn hình cho đường dẫn; null nếu không có hoặc vai trò không được vào. */
export function findRoute(path, role) {
  for (const r of ROUTES) {
    if (!r.roles.includes(role)) continue;
    const params = matchPath(r.path, path);
    if (params) return { ...r, params, navPath: r.nav ?? r.path };
  }
  return null;
}
