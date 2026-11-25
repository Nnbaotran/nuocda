// Bộ nhớ tạm cho các danh sách ít đổi (sản phẩm, khách, nhân viên): chuyển trang trong vòng 30 giây
// không phải hỏi lại database. Mọi thao tác thêm/sửa/xoá gọi invalidate() để xoá ngay bản tạm.
// KHÔNG dùng cho tiền, đơn hàng, công nợ, giá riêng — những thứ đó luôn đọc mới.
const store = new Map();

export const LIST_TTL = 30_000;

export function cached(key, ttlMs, load) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = load().catch((err) => {
    store.delete(key); // lỗi thì không nhớ, lần sau thử lại
    throw err;
  });
  store.set(key, { at: Date.now(), promise });
  return promise;
}

export function invalidate(...keys) {
  for (const k of keys) store.delete(k);
}
