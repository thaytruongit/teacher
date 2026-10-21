@echo off
chcp 65001 >nul
title TU DONG DAY DU AN HOC TOT LEN GITHUB (thaytruongit/teacher)
echo ============================================================================
echo   HE THONG HOC TOT! (THCS MAO DIEN) - TU DONG DAY DU AN LEN GITHUB
echo   Kho luu tru muc tieu: https://github.com/thaytruongit/teacher.git
echo ============================================================================
echo.

cd /d "%~dp0"

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Git CLI!
    echo Thay co the mo file index.html -^> muc "Day Len GitHub" de day truc tiep tren trinh duyet ma khong can cai Git!
    pause
    exit /b 1
)

if not exist ".git" (
    echo [1/5] Dang khoi tao kho Git cuc bo...
    git init
) else (
    echo [1/5] Kho Git cuc bo da san sang.
)

echo [2/5] Dang thiet lap nhanh main va ket noi https://github.com/thaytruongit/teacher.git ...
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin https://github.com/thaytruongit/teacher.git

echo [3/5] Dang dong goi toan bo tep du an (index.html, supabase_schema.sql, Code.gs...) ...
git add -A

echo [4/5] Dang tao ban ghi Commit...
git commit -m "Deploy He Thong Hoc Tot 4 Pha, E-Learning & KTDG (THCS Mao Dien)"

echo [5/5] Dang day du an len https://github.com/thaytruongit/teacher ...
git push -u origin main --force

echo.
if %errorlevel% equ 0 (
    echo ============================================================================
    echo   [THANH CONG] Da day toan bo du an len:
    echo   - Kho ma nguon: https://github.com/thaytruongit/teacher
    echo   - Website GitHub Pages: https://thaytruongit.github.io/teacher/
    echo ============================================================================
) else (
    echo ============================================================================
    echo   [LUU Y] Neu Git yeu cau dang nhap, hay dang nhap tai khoan thaytruongit
    echo   hoac su dung cong cu "Day Tu Dong Len GitHub" ngay trong file index.html!
    echo ============================================================================
)
pause
