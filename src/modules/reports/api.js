import { db, throwFriendly } from '../../lib/supabase.js';

/** Toàn bộ số liệu báo cáo được tổng hợp trong database (hàm report_overview). */
export async function reportOverview({ from, to, includePayroll }) {
  const sb = await db();
  const { data, error } = await sb.rpc('report_overview', { p_from: from, p_to: to, p_include_payroll: includePayroll });
  if (error) throwFriendly(error, 'Không tải được báo cáo');
  return data;
}
