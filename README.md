# Hãng đá Lệ Xuân – Mini app gia đình

Ứng dụng web (ưu tiên điện thoại) theo dõi bán hàng, công nợ khách, nhân viên, chấm công, lương, chi phí và báo cáo.

**Công nghệ:** HTML + JavaScript thuần (ES modules) · Tailwind CSS v4 (build bằng npm) · Supabase (đăng nhập, PostgreSQL, RLS) · Cloudflare Pages.

## Tiến độ

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Đăng nhập (1 tài khoản Chủ), sản phẩm | ✅ `v0.1.0` |
| 2 | Khách hàng + giá riêng | ✅ `v0.2.0` |
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

## Tài khoản

App chỉ có **một tài khoản duy nhất: Chủ**. Nhân viên KHÔNG đăng nhập; họ chỉ là danh sách do Chủ tạo để chấm công, tính lương (giai đoạn 4).

1. Tạo tài khoản Chủ: Supabase → **Authentication → Users → Add user → Create new user** (email + mật khẩu, tích *Auto confirm*).
   Người dùng **đầu tiên** tự động thành Chủ. *(Đã tạo ngày 25/11/2026.)*
2. Supabase → **Authentication → Sign In / Providers**: **tắt "Allow new users to sign up"**.
   (Kể cả khi quên tắt, tài khoản lạ cũng không xem được dữ liệu và bị app từ chối.)
3. Quên mật khẩu: Supabase → Authentication → Users → chọn tài khoản → đặt lại mật khẩu.

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
    customers/             Hồ sơ khách, popup giá lần đầu, hồ sơ 3 thẻ, bảng giá riêng
    home/, placeholder/    Trang tổng quan, trang "Sắp có"
supabase/
  migrations/              Thay đổi database theo thứ tự thời gian (đã áp lên Supabase)
  rollback/                Câu lệnh quay lui tương ứng từng migration
  functions/create-staff/  (đã ngừng – không dùng nữa, có thể xoá trên Supabase)
  seed.sql                 Dữ liệu mẫu (4 loại đá)
tests/                     Kiểm thử (node:test)
```

## Phân quyền (ép ở database bằng RLS)

| Bảng | Chủ (OWNER) | Tài khoản khác / chưa đăng nhập |
|---|---|---|
| `products`, `customers`, `customer_prices` | xem, thêm, sửa, xoá | không thấy gì |
| `profiles` | xem, sửa | chỉ thấy hồ sơ của chính mình |

Hàm database (RPC):
- `create_customer(...)`: tạo hồ sơ khách + giá lần đầu trong **một giao dịch** (lỗi giữa chừng thì không tạo gì).
- `set_customer_prices(customer_id, prices)`: lưu các giá đã đổi của một khách.
- Trigger: thêm sản phẩm mới → tự có giá (= giá chung) cho mọi khách. Giá riêng là bản sao độc lập, đổi giá chung sau này không ảnh hưởng.

- Tài khoản không phải Chủ: không xem được gì, app từ chối đăng nhập.
- Database chặn việc khoá/hạ quyền **Chủ cuối cùng**.
- Quy ước bảng mới: bật RLS, `revoke all … from anon`, chỉ `grant` đúng thao tác cần cho `authenticated`.

## Quy ước

- Tiền lưu số nguyên VND (`bigint`), hiển thị `1.234.567 ₫`; ngày `dd/mm/yyyy` theo giờ Việt Nam.
- Mỗi tính năng/sửa lỗi làm trên nhánh `feature/…` hoặc `fix/…`, gộp vào `main` khi chạy ổn, gắn tag sau mỗi giai đoạn.
- Thay đổi database: thêm file mới vào `supabase/migrations/` kèm file quay lui trong `supabase/rollback/`.
