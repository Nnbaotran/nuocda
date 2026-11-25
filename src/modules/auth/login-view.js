import { APP_NAME } from '../../config.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { icon } from '../../lib/ui.js';
import { signIn } from './session.js';

export function renderLogin(root, { notice } = {}) {
  setHtml(
    root,
    html`<main class="flex min-h-dvh items-center justify-center px-4 py-10">
      <div class="fade-in w-full max-w-sm">
        <div class="mb-8 text-center">
          <img src="/assets/favicon.svg" alt="" class="mx-auto mb-4 size-16 drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
          <h1 class="gradient-text text-3xl font-bold tracking-tight">${APP_NAME}</h1>
          <p class="mt-2 text-sm text-slate-400">Đăng nhập để tiếp tục</p>
        </div>
        <form class="card space-y-4 p-5" novalidate>
          <p class="form-error ${notice ? '' : 'hidden'}" data-form-error>${notice ?? ''}</p>
          <div>
            <label class="field-label" for="email">Email</label>
            <input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="username" required placeholder="ten@vidu.com" />
          </div>
          <div>
            <label class="field-label" for="password">Mật khẩu</label>
            <div class="relative">
              <input class="input pr-12" id="password" name="password" type="password" autocomplete="current-password" required />
              <button type="button" class="btn-icon absolute top-0 right-0" data-toggle-pw aria-label="Hiện mật khẩu">${icon('eye')}</button>
            </div>
          </div>
          <button type="submit" class="btn-primary w-full">Đăng nhập</button>
          <p class="text-center text-xs text-slate-500">Quên mật khẩu? Đặt lại trong Supabase › Authentication › Users.</p>
        </form>
      </div>
    </main>`,
  );

  const form = $('form', root);
  const errBox = $('[data-form-error]', form);
  const pw = form.elements.password;
  $('[data-toggle-pw]', form).addEventListener('click', () => {
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const password = pw.value;
    const showError = (msg) => {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    };
    if (!email || !password) return showError('Vui lòng nhập email và mật khẩu');
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập…';
    try {
      await signIn(email, password);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });
}
