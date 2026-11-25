// Bộ so khớp đường dẫn cho điều hướng kiểu #/khach-hang/:id (logic thuần, có test).

/** So khớp đường dẫn "/khach-hang/abc" với mẫu "/khach-hang/:id" -> { id: "abc" } hoặc null. */
export function matchPath(pattern, path) {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
