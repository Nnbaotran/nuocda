// Màn hình Tài khoản đăng nhập (chỉ Chủ): tạo tài khoản nhân viên, khoá/mở khoá, đổi vai trò, đổi tên.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatDate } from '../../lib/format.js';
import { confirmDialog, emptyState, errorState, icon, loadingState, openModal, showFieldErrors, toast } from '../../lib/ui.js';
import { currentUser, refreshProfile, ROLE_LABELS, signOut } from '../auth/session.js';
import { createStaffAccount, listAccounts, updateAccount } from './api.js';
import { validateStaffAccount } from './validate.js';

export function renderAccounts(root) {
  const state = { items: [] };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-400">Nhân viên đăng nhập bằng email + mật khẩu do Chủ tạo. Tài khoản bị khoá không đăng nhập được.</p>
        <button class="btn-primary" data-add>${icon('plus', 'size-4')} Tạo tài khoản nhân viên</button>
      </div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );
  const section = $('section', root);
  const listEl = $('[data-list]', section);
  const me = currentUser()?.id;

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.items = await listAccounts();
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function draw() {
    if (!state.items.length) return setHtml(listEl, emptyState('Chưa có tài khoản nào'));
    setHtml(
      listEl,
      html`<ul class="grid gap-3 md:grid-cols-2">
        ${state.items.map(
          (a) => html`<li class="card">
            <div class="flex items-start gap-3">
              <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500/25 to-violet-500/25 font-semibold text-white">
                ${(a.full_name || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-white">${a.full_name || 'Chưa đặt tên'} ${a.id === me ? html`<span class="text-xs font-normal text-slate-500">(bạn)</span>` : ''}</p>
                <p class="text-xs text-slate-500">Tạo ngày ${formatDate(a.created_at)}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span class="${a.role === 'OWNER' ? 'badge-violet' : 'badge-cyan'}">${ROLE_LABELS[a.role]}</span>
                  ${a.is_active ? html`<span class="badge-green">Đang hoạt động</span>` : html`<span class="badge-gray">Đã khoá</span>`}
                </div>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
              <button class="btn-secondary flex-1" data-rename="${a.id}">${icon('edit', 'size-4')} Đổi tên</button>
              <button class="btn-secondary flex-1" data-toggle="${a.id}">${a.is_active ? 'Khoá' : 'Mở khoá'}</button>
              <button class="btn-secondary flex-1" data-role="${a.id}">${a.role === 'OWNER' ? 'Chuyển thành Nhân viên' : 'Chuyển thành Chủ'}</button>
            </div>
          </li>`,
        )}
      </ul>`,
    );
  }

  async function save(id, patch, okMsg) {
    try {
      await updateAccount(id, patch);
      toast(okMsg);
      if (id === me) await refreshProfile().catch(() => signOut());
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openCreate() {
    openModal({
      title: 'Tạo tài khoản nhân viên',
      submitLabel: 'Tạo tài khoản',
      body: html`<div class="space-y-4">
        <div>
          <label class="field-label" for="sa-name">Họ tên *</label>
          <input class="input" id="sa-name" name="full_name" maxlength="100" required />
          <p class="field-error hidden" data-error-for="full_name"></p>
        </div>
        <div>
          <label class="field-label" for="sa-email">Email đăng nhập *</label>
          <input class="input" id="sa-email" name="email" type="email" inputmode="email" autocomplete="off" required />
          <p class="field-error hidden" data-error-for="email"></p>
        </div>
        <div>
          <label class="field-label" for="sa-pw">Mật khẩu ban đầu * (ít nhất 8 ký tự)</label>
          <input class="input" id="sa-pw" name="password" type="text" autocomplete="new-password" minlength="8" required />
          <p class="field-error hidden" data-error-for="password"></p>
        </div>
        <p class="text-xs text-slate-500">Gửi email và mật khẩu này cho nhân viên để đăng nhập.</p>
      </div>`,
      onSubmit: async (form) => {
        const f = form.elements;
        const { ok, value, errors } = validateStaffAccount({ full_name: f.full_name.value, email: f.email.value, password: f.password.value });
        showFieldErrors(form, errors);
        if (!ok) return false;
        await createStaffAccount(value);
        toast('Đã tạo tài khoản nhân viên');
        load();
      },
    });
  }

  function openRename(a) {
    openModal({
      title: 'Đổi tên hiển thị',
      body: html`<div>
        <label class="field-label" for="rn-name">Họ tên *</label>
        <input class="input" id="rn-name" name="full_name" maxlength="100" value="${a.full_name}" required />
        <p class="field-error hidden" data-error-for="full_name"></p>
      </div>`,
      onSubmit: async (form) => {
        const full_name = form.elements.full_name.value.trim();
        if (!full_name) {
          showFieldErrors(form, { full_name: 'Vui lòng nhập họ tên' });
          return false;
        }
        await updateAccount(a.id, { full_name });
        toast('Đã đổi tên');
        if (a.id === me) await refreshProfile().catch(() => signOut());
        load();
      },
    });
  }

  section.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-add]')) return openCreate();
    const find = (id) => state.items.find((x) => x.id === id);
    if (b.dataset.rename) return openRename(find(b.dataset.rename));
    if (b.dataset.toggle) {
      const a = find(b.dataset.toggle);
      const lock = a.is_active;
      if (await confirmDialog({ title: lock ? 'Khoá tài khoản' : 'Mở khoá tài khoản', message: `${lock ? 'Khoá' : 'Mở khoá'} tài khoản "${a.full_name || 'Chưa đặt tên'}"?`, confirmLabel: lock ? 'Khoá' : 'Mở khoá', danger: lock })) {
        save(a.id, { is_active: !lock }, lock ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản');
      }
    }
    if (b.dataset.role) {
      const a = find(b.dataset.role);
      const toOwner = a.role !== 'OWNER';
      const msg = toOwner
        ? `"${a.full_name || 'Tài khoản này'}" sẽ có TOÀN QUYỀN như Chủ (xem báo cáo, sửa giá, quản lý lương…). Tiếp tục?`
        : `"${a.full_name || 'Tài khoản này'}" sẽ chỉ còn quyền Nhân viên.`;
      if (await confirmDialog({ title: 'Đổi vai trò', message: msg, confirmLabel: 'Đổi vai trò' })) {
        save(a.id, { role: toOwner ? 'OWNER' : 'STAFF' }, 'Đã đổi vai trò');
      }
    }
  });

  load();
}
