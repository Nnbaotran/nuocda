// Đăng nhập. App chỉ dành cho MỘT tài khoản: Chủ (OWNER).
//
// Mở app nhanh: nếu máy đã có phiên đăng nhập + hồ sơ đã nhớ, vẽ màn hình NGAY (không chờ mạng),
// rồi kiểm tra lại với máy chủ ở nền. Kiểm tra thất bại (bị khoá, hết phiên) -> tự đăng xuất.
// Quyền thật vẫn do database (RLS) quyết định ở mọi lần đọc/ghi.
import { db, friendlyError, preloadDb, sessionStorageKey } from '../../lib/supabase.js';

const PROFILE_KEY = 'lexuan-profile';
const state = { user: null, profile: null, notice: null };
const listeners = new Set();

export const ROLE_LABELS = { OWNER: 'Chủ' };

export function currentProfile() {
  return state.profile;
}
export function isOwner() {
  return state.profile?.role === 'OWNER' && state.profile?.is_active === true;
}
/** Tên hiển thị: tên đã đặt, nếu chưa có thì dùng email. */
export function displayName() {
  return state.profile?.full_name || state.profile?.email || state.user?.email || 'Chủ';
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn(state);
}

function readCache() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    // Chỉ dùng hồ sơ nhớ khi máy vẫn còn phiên đăng nhập của supabase-js
    return p && localStorage.getItem(sessionStorageKey()) ? p : null;
  } catch {
    return null;
  }
}
function writeCache(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* không lưu được thì lần sau chờ mạng như bình thường */
  }
}

async function loadProfile(sb, user) {
  const { data, error } = await sb.from('profiles').select('id, full_name, role, is_active').eq('id', user.id).maybeSingle();
  if (error) throw new Error(friendlyError(error, 'Không tải được hồ sơ tài khoản'));
  if (!data || !data.is_active || data.role !== 'OWNER') throw new Error('Tài khoản này không có quyền dùng ứng dụng');
  return { ...data, email: user.email ?? '' };
}

async function clearSession(sb) {
  state.user = null;
  state.profile = null;
  writeCache(null);
  try {
    await (sb ?? (await db())).auth.signOut();
  } catch {
    /* mất mạng: phía app đã xoá phiên */
  }
}

function watch(sb) {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && state.profile) {
      state.user = null;
      state.profile = null;
      writeCache(null);
      emit();
    }
  });
}

/** Kiểm tra lại với máy chủ (chạy ở nền khi đã vẽ màn hình từ hồ sơ nhớ). */
async function verify() {
  const sb = await db();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  const profile = await loadProfile(sb, user);
  state.user = user;
  state.profile = profile;
  writeCache(profile);
  watch(sb);
}

/**
 * Gọi 1 lần khi mở app. Trả về { error } nếu cần hiện thông báo ở trang đăng nhập.
 * Có hồ sơ nhớ -> trả về ngay; nếu kiểm tra ở nền thất bại sẽ báo qua onSessionChange.
 */
export async function initSession() {
  const cached = readCache();
  if (cached) {
    state.profile = cached;
    verify().catch(async (err) => {
      // Mất mạng: vẫn cho xem tiếp (mọi lần đọc/ghi sẽ tự báo lỗi mạng). Lỗi khác: đăng xuất.
      if (/kết nối mạng/i.test(friendlyError(err, ''))) return;
      await clearSession();
      state.notice = err.message;
      emit();
    });
    return {};
  }

  preloadDb();
  // Máy không có phiên đăng nhập nào -> hiện trang đăng nhập ngay, không chờ tải thư viện
  try {
    if (!localStorage.getItem(sessionStorageKey())) return {};
  } catch {
    /* không đọc được localStorage: kiểm tra bằng thư viện như bình thường */
  }
  try {
    const sb = await db();
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      try {
        state.user = data.session.user;
        state.profile = await loadProfile(sb, data.session.user);
        writeCache(state.profile);
      } catch (err) {
        await clearSession(sb);
        return { error: err.message };
      }
    }
    watch(sb);
  } catch (err) {
    return { error: friendlyError(err, 'Không kết nối được máy chủ') };
  }
  return {};
}

/** Lấy (rồi xoá) thông báo cần hiện ở trang đăng nhập, ví dụ khi bị đăng xuất vì tài khoản bị khoá. */
export function takeNotice() {
  const n = state.notice;
  state.notice = null;
  return n;
}

export async function signIn(email, password) {
  const sb = await db();
  const { data, error } = await sb.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
  if (error) throw new Error(friendlyError(error, 'Đăng nhập không thành công'));
  try {
    state.user = data.user;
    state.profile = await loadProfile(sb, data.user);
    writeCache(state.profile);
  } catch (err) {
    await clearSession(sb);
    throw err;
  }
  emit();
}

export async function signOut() {
  await clearSession();
  emit();
}
