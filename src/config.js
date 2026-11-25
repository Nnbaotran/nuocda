// MỌI cấu hình và đường link của dự án nằm ở file này.
// Khoá Supabase KHÔNG viết ở đây: chúng được đưa vào lúc build từ .env / biến môi trường Cloudflare.

/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__, __APP_VERSION__ */
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;
export const APP_VERSION = __APP_VERSION__;

export const APP_NAME = 'Hãng đá Lệ Xuân';
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export const LINKS = {
  googleDrive: 'https://drive.google.com/drive/u/0/folders/1DgTNyGKhSqYgRkY8u8q3ISNplGSrCWv5',
  supabase: 'https://supabase.com/dashboard/project/jgbonqmofdjyvrddatrd',
  cloudflare: 'https://dash.cloudflare.com/b52710b4bec70750a6c88d3366584c5e/home',
  github: 'https://github.com/Nnbaotran/nuocda',
};

// Gợi ý đơn vị tính khi nhập sản phẩm (vẫn gõ tự do được)
export const UNIT_SUGGESTIONS = ['cây', 'bao', 'kg', 'thùng', 'túi'];
