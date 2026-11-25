import { cached, invalidate, LIST_TTL } from '../../lib/cache.js';
import { db, throwFriendly } from '../../lib/supabase.js';


// ---- Nhân viên ----
const EMP_COLS = 'id, name, phone, position, salary_type, salary_amount, note, is_active';

async function fetchListEmployeesFresh() {
  const sb = await db();
  const { data, error } = await sb.from('employees').select(EMP_COLS).order('is_active', { ascending: false }).order('name');
  if (error) throwFriendly(error, 'Không tải được danh sách nhân viên');
  return data;
}
export async function createEmployee(v) {
  invalidate('employees');
  const sb = await db();
  const { error } = await sb.from('employees').insert(v);
  if (error) throwFriendly(error, 'Không thêm được nhân viên');
}
export async function updateEmployee(id, v) {
  invalidate('employees');
  const sb = await db();
  const { data, error } = await sb.from('employees').update(v).eq('id', id).select('id').maybeSingle();
  if (error) throwFriendly(error, 'Không lưu được nhân viên');
  if (!data) throw new Error('Bạn không có quyền sửa nhân viên này');
}
export async function deleteEmployee(id) {
  invalidate('employees');
  const sb = await db();
  const { error, count } = await sb.from('employees').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new Error('Nhân viên đã có chấm công/lương nên không xoá được. Hãy chuyển sang "Nghỉ việc".');
    throwFriendly(error, 'Không xoá được nhân viên');
  }
  if (count === 0) throw new Error('Bạn không có quyền xoá nhân viên này');
}

// ---- Chấm công ----
export async function listAttendance(from, to) {
  const sb = await db();
  const { data, error } = await sb
    .from('attendance')
    .select('employee_id, work_date, status, units, check_in, check_out, note')
    .gte('work_date', from)
    .lte('work_date', to);
  if (error) throwFriendly(error, 'Không tải được bảng chấm công');
  return data;
}
/** Ghi (thêm hoặc sửa) nhiều ô chấm công cùng lúc. */
export async function saveAttendance(rows) {
  const sb = await db();
  const { error } = await sb.from('attendance').upsert(rows, { onConflict: 'employee_id,work_date' });
  if (error) throwFriendly(error, 'Không lưu được chấm công');
}
export async function clearAttendance(employeeId, workDate) {
  const sb = await db();
  const { error } = await sb.from('attendance').delete().eq('employee_id', employeeId).eq('work_date', workDate);
  if (error) throwFriendly(error, 'Không xoá được ô chấm công');
}

// ---- Thưởng / phạt ----
export async function listAdjustments(from, to) {
  const sb = await db();
  const { data, error } = await sb
    .from('salary_adjustments')
    .select('id, employee_id, adj_date, kind, amount, reason, employees(name)')
    .gte('adj_date', from)
    .lte('adj_date', to)
    .order('adj_date');
  if (error) throwFriendly(error, 'Không tải được thưởng/phạt');
  return data;
}
export async function createAdjustment(v) {
  const sb = await db();
  const { error } = await sb.from('salary_adjustments').insert(v);
  if (error) throwFriendly(error, 'Không lưu được thưởng/phạt');
}
export async function deleteAdjustment(id) {
  const sb = await db();
  const { error } = await sb.from('salary_adjustments').delete().eq('id', id);
  if (error) throwFriendly(error, 'Không xoá được thưởng/phạt');
}

// ---- Bảng lương ----
export async function payrollPreview(ym) {
  const sb = await db();
  const { data, error } = await sb.rpc('payroll_preview', { p_month: `${ym}-01` });
  if (error) throwFriendly(error, 'Không tính được bảng lương');
  return data;
}
export async function closePayroll(ym) {
  const sb = await db();
  const { data, error } = await sb.rpc('close_payroll', { p_month: `${ym}-01` });
  if (error) throwFriendly(error, 'Không chốt được bảng lương');
  return data;
}
export async function reopenPayroll(ym, reason) {
  const sb = await db();
  const { error } = await sb.rpc('reopen_payroll', { p_month: `${ym}-01`, p_reason: reason ?? '' });
  if (error) throwFriendly(error, 'Không mở chốt được');
}
/** Tháng đã chốt chưa (để khoá chấm công trên giao diện). */
export async function isMonthClosed(ym) {
  const sb = await db();
  const { count, error } = await sb.from('payroll').select('id', { count: 'exact', head: true }).eq('month', `${ym}-01`);
  if (error) throwFriendly(error, 'Không kiểm tra được trạng thái chốt lương');
  return count > 0;
}

/** Có nhớ tạm 30 giây (xem lib/cache.js). */
export function listEmployees() {
  return cached('employees', LIST_TTL, fetchListEmployeesFresh);
}
