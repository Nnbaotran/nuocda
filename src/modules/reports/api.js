import { friendlyError, supabase } from '../../lib/supabase.js';

/** Toàn bộ số liệu báo cáo được tổng hợp trong database (hàm report_overview). */
export async function reportOverview({ from, to, includePayroll }) {
  const { data, error } = await supabase.rpc('report_overview', { p_from: from, p_to: to, p_include_payroll: includePayroll });
  if (error) throw new Error(friendlyError(error, 'Không tải được báo cáo'));
  return data;
}
