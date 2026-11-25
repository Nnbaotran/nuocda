// Quản lý đăng nhập. App chỉ dành cho MỘT tài khoản: Chủ (OWNER).
// LƯU Ý: việc ẩn/hiện nút ở giao diện chỉ để tiện dùng; quyền thật được database (RLS) kiểm tra.
import { friendlyError, supabase } from '../../lib/supabase.js';

const state = { user: null, profile: null };
const listeners = new Set();

export const ROLES = { OWNER: 'OWNER', STAFF: 'STAFF' };
export const ROLE_LABELS = { OWNER: 'Chủ', STAFF: 'Nhân viên' };

export function currentUser() {
  return state.user;
}
export function currentProfile() {
  return state.profile;
}
/** Tên hiển thị: tên đã đặt, nếu chưa có thì dùng email. */
export function displayName() {
  return state.profile?.full_name || state.user?.email || 'Chủ';
}

export function isOwner() {
  return state.profile?.role === ROLES.OWNER && state.profile?.is_active === true;
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn(state);
}

async function loadProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error, 'Không tải được hồ sơ tài khoản'));
  if (!data) throw new Error('Tài khoản này không có quyền dùng ứng dụng');
  if (!data.is_active || data.role !== ROLES.OWNER) throw new Error('Tài khoản này không có quyền dùng ứng dụng');
  return data;
}

/** Gọi 1 lần khi mở app: khôi phục phiên đăng nhập cũ (nếu có). */
export async function initSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    try {
      state.user = data.session.user;
      state.profile = await loadProfile(data.session.user);
    } catch (err) {
      await supabase.auth.signOut();
      state.user = null;
      state.profile = null;
      return { error: err.message };
    }
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      emit();
    }
  });
  return {};
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendlyError(error, 'Đăng nhập không thành công'));
  try {
    state.user = data.user;
    state.profile = await loadProfile(data.user);
  } catch (err) {
    await supabase.auth.signOut();
    state.user = null;
    state.profile = null;
    throw err;
  }
  emit();
}

export async function signOut() {
  await supabase.auth.signOut();
  state.user = null;
  state.profile = null;
  emit();
}

export async function refreshProfile() {
  if (!state.user) return;
  state.profile = await loadProfile(state.user);
  emit();
}
