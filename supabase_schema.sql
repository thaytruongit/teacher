-- ============================================================================
-- HỆ THỐNG HỌC TỐT! (THCS MÃO ĐIỀN) - THIẾT KẾ CƠ SỞ DỮ LIỆU TỐI ƯU (SUPABASE POSTGRESQL)
-- Phiên bản: 9.0 (Miễn phí 100%, Băng thông rộng, Chống nghẽn 45 máy phòng Tin học)
-- Hướng dẫn: Dán toàn bộ script này vào mục SQL Editor trên https://supabase.com
-- và nhấn RUN để khởi tạo đầy đủ 6 bảng, Indexes tốc độ cao và kênh Realtime.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. BẢNG DANH MỤC BÀI GIẢNG 4 PHA (lessons_catalog)
CREATE TABLE IF NOT EXISTS public.lessons_catalog (
  lesson_key      TEXT PRIMARY KEY,
  grade           TEXT NOT NULL DEFAULT 'Khối 6',
  semester        TEXT NOT NULL DEFAULT 'HK1',
  period          TEXT NOT NULL DEFAULT 'Tiết 1',
  period_num      INT  NOT NULL DEFAULT 1,
  title           TEXT NOT NULL,
  slide_count     INT  NOT NULL DEFAULT 0,
  phase_summary   JSONB NOT NULL DEFAULT '{"P1":0,"P2":0,"P3":0,"P4":0}'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_grade_period
  ON public.lessons_catalog (grade, semester, period_num);

-- 2. BẢNG CHI TIẾT CÁC BƯỚC / SLIDE BÀI GIẢNG (lesson_slides)
CREATE TABLE IF NOT EXISTS public.lesson_slides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_key        TEXT NOT NULL REFERENCES public.lessons_catalog(lesson_key) ON DELETE CASCADE,
  step_order        INT  NOT NULL,
  phase             TEXT NOT NULL DEFAULT 'Pha 2: Hình thành kiến thức',
  slide_type        TEXT NOT NULL DEFAULT 'QUIZ',
  is_ghi_vo         BOOLEAN NOT NULL DEFAULT FALSE,
  question_text     TEXT NOT NULL DEFAULT '',
  options           JSONB NOT NULL DEFAULT '["Đáp án A","Đáp án B","Đáp án C","Đáp án D"]'::jsonb,
  correct_list      JSONB NOT NULL DEFAULT '[0]'::jsonb,
  multi_mode        TEXT NOT NULL DEFAULT 'EXACT',
  time_limit_sec    INT  NOT NULL DEFAULT 20,
  media_url         TEXT DEFAULT '',
  video_config      JSONB DEFAULT '{"url":"","startSec":0,"endSec":0,"note":""}'::jsonb,
  ai_explanation    TEXT DEFAULT '',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_key, step_order)
);

CREATE INDEX IF NOT EXISTS idx_slides_lesson_order
  ON public.lesson_slides (lesson_key, step_order);

-- 3. BẢNG PHÒNG TRÌNH CHIẾU TRỰC TIẾP TRÊN LỚP (live_rooms)
CREATE TABLE IF NOT EXISTS public.live_rooms (
  room_pin          TEXT PRIMARY KEY,
  lesson_key        TEXT NOT NULL,
  grade             TEXT NOT NULL DEFAULT 'Khối 6',
  period            TEXT NOT NULL DEFAULT 'Tiết 7',
  lesson_title      TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'LOBBY',
  current_q_index   INT  NOT NULL DEFAULT 0,
  total_questions   INT  NOT NULL DEFAULT 1,
  q_start_time_ms   BIGINT NOT NULL DEFAULT 0,
  score_immediately BOOLEAN NOT NULL DEFAULT TRUE,
  current_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. BẢNG PHẢN HỒI TRỰC TIẾP CỦA HỌC SINH TRONG PHÒNG CHIẾU (live_submissions)
CREATE TABLE IF NOT EXISTS public.live_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_pin          TEXT NOT NULL REFERENCES public.live_rooms(room_pin) ON DELETE CASCADE,
  question_index    INT  NOT NULL,
  student_name      TEXT NOT NULL,
  student_class     TEXT NOT NULL DEFAULT '6A1',
  answer_given      TEXT NOT NULL,
  is_correct        BOOLEAN NOT NULL DEFAULT FALSE,
  elapsed_ms        INT  NOT NULL DEFAULT 1000,
  points_earned     INT  NOT NULL DEFAULT 0,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_pin, question_index, student_name)
);

CREATE INDEX IF NOT EXISTS idx_live_sub_room_q
  ON public.live_submissions (room_pin, question_index);

-- 5. BẢNG NGÂN HÀNG ĐỀ THI & KIỂM TRA THEO TIẾT, KHỐI (exams_bank)
CREATE TABLE IF NOT EXISTS public.exams_bank (
  exam_id           TEXT PRIMARY KEY,
  grade             TEXT NOT NULL DEFAULT 'Khối 9',
  period_type       TEXT NOT NULL DEFAULT 'midterm',
  exam_code         TEXT NOT NULL DEFAULT 'DE1',
  title             TEXT NOT NULL,
  duration_min      INT  NOT NULL DEFAULT 45,
  mcq_questions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  fill_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  essay_config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_grade_period
  ON public.exams_bank (grade, period_type);

-- 6. BẢNG TỔNG HỢP KẾT QUẢ THI & TỰ HỌC E-LEARNING (exam_results)
CREATE TABLE IF NOT EXISTS public.exam_results (
  id                BIGSERIAL PRIMARY KEY,
  result_type       TEXT NOT NULL DEFAULT 'EXAM',
  grade             TEXT NOT NULL DEFAULT 'Khối 9',
  student_class     TEXT NOT NULL DEFAULT '9A1',
  machine_no        TEXT DEFAULT 'Máy 01',
  student_name      TEXT NOT NULL,
  exam_title        TEXT NOT NULL,
  exam_code         TEXT DEFAULT 'DE1',
  score_mcq         NUMERIC(4,2) NOT NULL DEFAULT 0,
  score_fill        NUMERIC(4,2) NOT NULL DEFAULT 0,
  score_essay       NUMERIC(4,2) NOT NULL DEFAULT 0,
  penalty_score     NUMERIC(4,2) NOT NULL DEFAULT 0,
  total_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  tab_switches      INT  NOT NULL DEFAULT 0,
  duration_sec      INT  NOT NULL DEFAULT 0,
  status_comment    TEXT DEFAULT 'Đã chấm tự động',
  details_json      JSONB DEFAULT '{}'::jsonb,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_grade_class_time
  ON public.exam_results (grade, student_class, submitted_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_submissions;
