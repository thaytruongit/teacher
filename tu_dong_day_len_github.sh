#!/usr/bin/env bash
set -e
echo "============================================================================"
echo "  HỆ THỐNG HỌC TỐT! (THCS MÃO ĐIỀN) - TỰ ĐỘNG ĐẨY DỰ ÁN LÊN GITHUB"
echo "  Kho lưu trữ mục tiêu: https://github.com/thaytruongit/teacher.git"
echo "============================================================================"

cd "$(dirname "$0")"

if [ ! -d ".git" ]; then
  echo "[1/5] Đang khởi tạo Git..."
  git init
fi

echo "[2/5] Đang cấu hình nhánh main và remote origin..."
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/thaytruongit/teacher.git

echo "[3/5] Đang thêm toàn bộ tệp dự án..."
git add -A

echo "[4/5] Đang tạo commit..."
git commit -m "Deploy He Thong Hoc Tot 4 Pha, E-Learning & KTDG (THCS Mao Dien)" || true

echo "[5/5] Đang đẩy lên https://github.com/thaytruongit/teacher ..."
git push -u origin main --force

echo "✅ Hoàn tất! Truy cập tại: https://github.com/thaytruongit/teacher"
