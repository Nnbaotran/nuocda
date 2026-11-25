# Hãng đá Lệ Xuân – Mini app gia đình

Ứng dụng web (ưu tiên điện thoại) theo dõi bán hàng, công nợ khách, nhân viên, chấm công, lương, chi phí và báo cáo.

**Công nghệ:** HTML + JavaScript thuần (ES modules) · Tailwind CSS v4 (build bằng npm) · Supabase (đăng nhập, PostgreSQL, RLS) · Cloudflare Pages.

## Tiến độ

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Đăng nhập, phân quyền, sản phẩm, tài khoản nhân viên | ✅ `v0.1.0` |
| 2 | Khách hàng + giá riêng | ⏳ |
| 3 | Đơn hàng + công nợ | ⏳ |
| 4 | Nhân viên + chấm công + lương | ⏳ |
| 5 | Chi phí + báo cáo | ⏳ |
| 6 | Hoàn thiện deploy | ⏳ |

## Chạy ở máy tính

Cần Node.js 22 trở lên.

```bash
npm install
cp .env.example .env      # rồi điền SUPABASE_URL và SUPABASE_ANON_KEY
npm run dev               # mở http://localhost:5173
npm test                  # chạy kiểm thử
npm run build             # tạo bản hoàn chỉnh trong thư mục dist/
```

## Deploy lên Cloudflare Pages

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → chọn repo `Nnbaotran/nuocda`.
2. Cấu hình build:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables** (Production và Preview):
   - `SUPABASE_URL` = `https://<mã-dự-án>.supabase.co`
   - `SUPABASE_ANON_KEY` = khoá *publishable* (`sb_publishable_…`) trong Supabase → Project Settings → API Keys
   - (tuỳ chọn) `NODE_VERSION` = `22`
4. Bấm **Save and Deploy**. Mỗi lần đẩy code lên `main`, Cloudflare tự build lại.
5. Supabase → Authentication → URL Configuration: đặt **Site URL** = địa chỉ `*.pages.dev` vừa có.

> Không bao giờ đưa khoá `service_role` vào `.env` hay Cloudflare. Khoá đó chỉ nằm trên máy chủ Supabase (Edge Function dùng tự động).

## Tạo tài khoản Chủ lần đầu

1. Supabase → **Authentication → Users → Add user → Create new user**, nhập email + mật khẩu, tích *Auto confirm*.
   Người dùng **đầu tiên** tự động thành **Chủ (OWNER)**.
2. Supabase → **Authentication → Sign In / Providers**: **tắt "Allow new users to sign up"**. Từ đây chỉ Chủ tạo được tài khoản (trong app, mục *Tài khoản đăng nhập*).
   (Kể cả khi quên tắt, người tự đăng ký vẫn bị khoá cho tới khi Chủ mở.)

## Cấu trúc thư mục

```
index.html                 Khung trang
public/                    File tĩnh (favicon, _headers bảo mật cho Cloudflare)
scripts/build.mjs          Build: esbuild gói JS, đưa cấu hình .env vào
src/
  config.js                MỌI cấu hình/đường link nằm ở đây
  main.js, routes.js       Khởi động app, danh sách màn hình + quyền xem
  styles.css               Tailwind + bộ giao diện (nút, thẻ, bảng, form…)
  lib/                     Dùng chung: format tiền/ngày, DOM an toàn, UI, kết nối Supabase
  modules/
    auth/                  Đăng nhập, phiên, vai trò
    layout/                Header, sidebar, thanh điều hướng điện thoại
    products/              Sản phẩm (api, kiểm tra dữ liệu, màn hình)
    accounts/              Tài khoản đăng nhập (Chủ quản lý)
    home/, placeholder/    Trang tổng quan, trang "Sắp có"
supabase/
  migrations/              Thay đổi database theo thứ tự thời gian (đã áp lên Supabase)
  rollback/                Câu lệnh quay lui tương ứng từng migration
  functions/create-staff/  Edge Function: Chủ tạo tài khoản nhân viên
  seed.sql                 Dữ liệu mẫu (4 loại đá)
tests/                     Kiểm thử (node:test)
```

## Phân quyền (ép ở database bằng RLS)

| Bảng | Chủ (OWNER) | Nhân viên (STAFF) | Chưa đăng nhập |
|---|---|---|---|
| `products` | xem, thêm, sửa, xoá | chỉ xem | không thấy gì |
| `profiles` | xem tất cả; sửa tên/vai trò/khoá | chỉ xem của mình | không thấy gì |

- Tài khoản bị khoá: không xem được gì, app tự đăng xuất.
- Database chặn việc khoá/hạ quyền **Chủ cuối cùng**.
- Quy ước bảng mới: bật RLS, `revoke all … from anon`, chỉ `grant` đúng thao tác cần cho `authenticated`.

## Quy ước

- Tiền lưu số nguyên VND (`bigint`), hiển thị `1.234.567 ₫`; ngày `dd/mm/yyyy` theo giờ Việt Nam.
- Mỗi tính năng/sửa lỗi làm trên nhánh `feature/…` hoặc `fix/…`, gộp vào `main` khi chạy ổn, gắn tag sau mỗi giai đoạn.
- Thay đổi database: thêm file mới vào `supabase/migrations/` kèm file quay lui trong `supabase/rollback/`.
