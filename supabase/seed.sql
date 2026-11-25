-- Dữ liệu mẫu (chỉ là ví dụ, chủ tự sửa trong app). Chạy lại nhiều lần không bị trùng.
insert into public.products (sku, name, unit, price, note)
values
  ('DA-CAY',  'Đá cây',  'cây', 30000, 'Mẫu – chủ tự sửa giá'),
  ('DA-VIEN', 'Đá viên', 'bao', 25000, 'Mẫu – chủ tự sửa giá'),
  ('DA-XAY',  'Đá xay',  'bao', 20000, 'Mẫu – chủ tự sửa giá'),
  ('DA-BI',   'Đá bi',   'bao', 22000, 'Mẫu – chủ tự sửa giá')
on conflict (sku) where sku is not null do nothing;
