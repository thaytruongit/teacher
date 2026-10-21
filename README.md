# HỆ THỐNG HỌC TỐT! (THCS MÃO ĐIỀN) — BÀI GIẢNG 4 PHA, TRÌNH CHIẾU PHÒNG HỌC, E-LEARNING & KIỂM TRA ĐÁNH GIÁ

- **Kho lưu trữ GitHub**: [https://github.com/thaytruongit/teacher](https://github.com/thaytruongit/teacher)
- **Website GitHub Pages**: [https://thaytruongit.github.io/teacher/](https://thaytruongit.github.io/teacher/)
- **Thiết kế & Phát triển**: **Thầy Đỗ Mạnh Trường** — Trường THCS Mão Điền, Bắc Ninh.

---

## PHẦN I. CÁCH ĐẨY TỰ ĐỘNG DỰ ÁN LÊN `https://github.com/thaytruongit/teacher`

Hệ thống hỗ trợ **2 cách đẩy tự động 100%** lên kho lưu trữ `thaytruongit/teacher`:

### Cách 1: Đẩy Tự Động Ngay Trên Trình Duyệt (Không cần cài Git)
1. Mở tệp **`index.html`** và bấm vào nút **`🐙 Đẩy Lên GitHub`** trên thanh công cụ trên cùng (hoặc vào mục **`🗄️ Database & GitHub`**).
2. Dán mã **GitHub Personal Access Token (`ghp_...`)** của tài khoản `thaytruongit` (tạo nhanh tại `https://github.com/settings/tokens/new?scopes=repo,workflow` với quyền `repo`).
3. Nhấn nút **`🚀 TỰ ĐỘNG ĐẨY TOÀN BỘ DỰ ÁN LÊN GITHUB (thaytruongit/teacher)`**:
   - Hệ thống tự động kiểm tra/khởi tạo kho `thaytruongit/teacher`.
   - Tự động đẩy các tệp `index.html`, `soan_bai_hoc_giao_vien_trang_5.html`, `supabase_schema.sql`, `README.md`, `appsscript.json`, `.nojekyll` lên nhánh `main`.
   - Tự động kích hoạt **GitHub Pages** tại địa chỉ: `https://thaytruongit.github.io/teacher/`.

### Cách 2: Chạy Tệp Tự Động 1-Click Trên Máy Tính (`tu_dong_day_len_github.bat`)
1. Giải nén gói **`teacher_github_repo_full.zip`** vào một thư mục trên máy tính.
2. Nhấp đúp chuột chạy tệp **`tu_dong_day_len_github.bat`** (trên Windows) hoặc chạy `bash tu_dong_day_len_github.sh` (trên macOS/Linux).
3. Script sẽ tự động khởi tạo Git, kết nối tới `https://github.com/thaytruongit/teacher.git`, commit toàn bộ mã nguồn và đẩy thẳng lên nhánh `main`.

---

## PHẦN II. KIẾN TRÚC DATABASE MIỄN PHÍ BĂNG THÔNG RỘNG & CHỐNG NGHẼN 45 MÁY

| Tiêu chí kỹ thuật | 🏆 Phương án 1 (Khuyên dùng): **Supabase (PostgreSQL + Realtime + CDN)** | Phương án 2: **Firebase (Realtime DB / Firestore)** | Phương án 3: **Google Sheets + Apps Script (`Code.gs`)** |
| :--- | :--- | :--- | :--- |
| **Chi phí gói Free** | **0đ / tháng** (500MB PostgreSQL Database + 1GB File Storage CDN) | **0đ / tháng** (Gói Spark: 1GB lưu trữ) | **0đ / tháng** (Lưu trên Google Drive cá nhân) |
| **Băng thông miễn phí** | **5GB CDN Bandwidth + 2.000.000 tin nhắn Realtime WebSocket / tháng** | 10GB/tháng nhưng giới hạn 100 kết nối đồng thời | Giới hạn ~30 request đồng thời |
| **Tốc độ phản hồi (Latency)** | **15ms – 30ms** (Kênh WebSocket & PostgREST API trực tiếp) | 25ms – 50ms | **800ms – 2.500ms** (Chờ khởi tạo V8 và `LockService`) |
| **Chống nghẽn khi 45 máy nộp cùng lúc** | **Row-Level Locking của PostgreSQL**: 45 học sinh `INSERT` 45 dòng độc lập trong cùng 1 mili-giây | Tốt nhưng khó truy vấn thống kê phức tạp | Xếp hàng tuần tự qua `LockService.getScriptLock()` |
| **Vai trò trong Học Tốt!** | **Database chính (Primary Realtime & Storage Engine)** cho Website trên GitHub Pages | Phương án dự phòng thay thế | **Cổng đồng bộ Sổ điểm Excel (Secondary Sync)** trên Google Drive |

---

## PHẦN III. DANH MỤC TỆP TRONG KHO LƯU TRỮ `thaytruongit/teacher`

- **`index.html`**: Ứng dụng Web trung tâm tích hợp đủ 8 phân hệ (Trình Chiếu Phòng Học Giáo Viên, Học tập Học sinh chuẩn `1.jpg`, Thuyết trình E-Learning 4 Pha, Phòng Thi KTGK/KTTX 3 phần, Khu vực Tạo đề thi & Soạn bài Page 5 có hiệu ứng chọn đáp án đúng bằng tay rõ nét, Đấu trường Mã Lớp, Sổ điểm xuất CSV và Trung tâm Database & Tự động đẩy GitHub).
- **`soan_bai_hoc_giao_vien_trang_5.html`**: Phân hệ chuyên biệt Page 5 Soạn bài học & Trình chiếu phòng học.
- **`supabase_schema.sql`**: Script SQL khởi tạo 6 bảng PostgreSQL và bật kênh Realtime trên Supabase.
- **`Code.gs`**, **`Teacher.html`**, **`Student.html`**, **`appsscript.json`**: Bộ mã nguồn Google Apps Script đồng bộ sổ điểm Google Sheets và REST API không lỗi CORS.
- **`tu_dong_day_len_github.bat`** & **`tu_dong_day_len_github.sh`**: Script tự động đẩy dự án lên `https://github.com/thaytruongit/teacher.git`.
- **`.github/workflows/deploy-pages.yml`**: Cấu hình GitHub Actions tự động xuất bản GitHub Pages mỗi khi cập nhật mã nguồn.
