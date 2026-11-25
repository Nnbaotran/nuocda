// Nguồn vẽ logo (SVG). Sửa ở đây rồi xuất lại các file trong public/assets (logo.svg, favicon-v*.svg, icons/*.png).
// Lần đổi logo sau: tăng số phiên bản trong tên file (v2 -> v3) để máy người dùng tải bản mới.
// Logo chính thức: nền đỏ Lệ Xuân + khối đá xanh băng (nước đá) + bông tuyết (lạnh) + chữ L, X (Lệ Xuân)
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a69"/><stop offset="1" stop-color="#b8162a"/></linearGradient>
  <linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c7ecfd"/></linearGradient>
  <linearGradient id="left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
  <linearGradient id="right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0284c7"/></linearGradient>
</defs>`;
const cubeShape = `
  <path d="M32 12 50 22.5 32 33 14 22.5Z" fill="url(#top)"/>
  <path d="M14 22.5 32 33V54L14 43.5Z" fill="url(#left)"/>
  <path d="M50 22.5 32 33V54L50 43.5Z" fill="url(#right)"/>
  <path d="M32 12 50 22.5V43.5L32 54 14 43.5V22.5Z" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 22.5 32 33 50 22.5M32 33V54" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/>`;
const flake = `<g transform="translate(32 22.5) scale(1 .577)" stroke="#0284c7" stroke-width="1.3" stroke-linecap="round" fill="none">
    <path d="M0-7V7M-6.06-3.5 6.06 3.5M-6.06 3.5 6.06-3.5"/>
    <path d="M-1.8-5.3 0-7 1.8-5.3M-1.8 5.3 0 7 1.8 5.3M-6.4-1.1-6.06-3.5-3.8-4M6.4 1.1 6.06 3.5 3.8 4M-6.4 1.1-6.06 3.5-3.8 4M6.4-1.1 6.06-3.5 3.8-4"/>
  </g>`;
// Chữ L và X vẽ bằng nét (không phụ thuộc phông chữ của máy), nghiêng theo 2 mặt khối đá
const letters = `<g stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path transform="translate(23 38) matrix(1 .577 0 1 0 0)" d="M-3.2-6.2V6H3.8"/>
    <path transform="translate(41 38) matrix(1 -.577 0 1 0 0)" d="M-3.6-6.2 3.6 6M3.6-6.2-3.6 6"/>
  </g>`;
const sparkle = (x, y, s) => `<path d="M${x} ${y - s}V${y + s}M${x - s} ${y}H${x + s}" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>`;
const big = (inner, k = 1.17) => `<g transform="translate(32 33) scale(${k}) translate(-32 -33)">${inner}</g>`;

export const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" rx="15" fill="url(#bg)"/>${sparkle(53, 10, 2.6)}${sparkle(9.5, 55, 1.8)}
  ${big(cubeShape + flake + letters)}</svg>`;
// Bản nhỏ (tab trình duyệt 16–32px): bỏ chữ + bông tuyết để khối đá rõ nét
export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>${big(cubeShape.replace('stroke-width="1.5"', 'stroke-width="2.6"').replace('stroke-width="1.1"', 'stroke-width="2.2"'), 1.28)}</svg>`;
// Bản cho biểu tượng app "maskable" (Android cắt tròn): nền tràn, logo thu vào vùng an toàn
export const MASKABLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" fill="url(#bg)"/><g transform="translate(32 32) scale(.8) translate(-32 -32)">${big(cubeShape + flake + letters)}</g></svg>`;
// Biểu tượng iPhone (iOS tự bo góc): nền tràn, logo hơi thu nhỏ
export const APPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" fill="url(#bg)"/>${sparkle(53, 10, 2.4)}<g transform="translate(32 32) scale(.9) translate(-32 -32)">${big(cubeShape + flake + letters)}</g></svg>`;
