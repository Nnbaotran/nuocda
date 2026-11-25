// Build site tĩnh vào thư mục dist/.
//   npm run build  -> build 1 lần (Cloudflare Pages dùng lệnh này)
//   npm run dev    -> chạy thử ở máy: http://localhost:5173 (tự build lại khi sửa file)
// Cấu hình Supabase đọc từ biến môi trường hoặc file .env (xem .env.example).
import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const serve = process.argv.includes('--serve');

function loadEnvFile() {
  const file = resolve(root, '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnvFile(), ...process.env };
const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`\n[build] Thiếu biến môi trường: ${missing.join(', ')}`);
  console.error('[build] Ở máy: tạo file .env theo mẫu .env.example. Trên Cloudflare: Settings > Variables.\n');
  process.exit(1);
}

const version = Date.now().toString(36);

function copyStatic() {
  mkdirSync(resolve(dist, 'assets'), { recursive: true });
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
    .replaceAll('__BUILD_VERSION__', version)
    .replaceAll('__SUPABASE_ORIGIN__', new URL(env.SUPABASE_URL).origin);
  writeFileSync(resolve(dist, 'index.html'), html);
  if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), dist, { recursive: true });
  // Mỗi bản build có mã riêng để service worker bỏ bộ nhớ đệm cũ
  const sw = resolve(dist, 'sw.js');
  if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD_VERSION__', version));
}

const options = {
  // Chia nhỏ mã (code splitting): app.js chỉ chứa phần khởi động; mỗi trang + thư viện Supabase
  // nằm ở file riêng trong assets/chunks/ (tên có mã băm -> trình duyệt nhớ lâu, đổi nội dung là đổi tên).
  entryPoints: { app: resolve(root, 'src/main.js') },
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2020',
  minify: !serve,
  sourcemap: serve,
  outdir: resolve(dist, 'assets'),
  chunkNames: 'chunks/[name]-[hash]',
  define: {
    __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
    __APP_VERSION__: JSON.stringify(version),
  },
  logLevel: 'info',
};

rmSync(dist, { recursive: true, force: true });
copyStatic();

if (serve) {
  const css = spawn('tailwindcss', ['-i', 'src/styles.css', '-o', 'dist/assets/app.css', '--watch'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  process.on('exit', () => css.kill());
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 5173 });
  console.log(`\n[dev] Mở http://localhost:${port}\n`);
} else {
  await build(options);
}
