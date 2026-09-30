@echo off
chcp 65001 >nul
title อัปโหลดขึ้นเว็บไซต์ (Deploy to Firebase Hosting)
color 0b

echo ======================================================
echo    🚀 กำลังเตรียมอัปโหลดไฟล์ขึ้นเว็บไซต์ Firebase...
echo ======================================================
echo.

set "PATH=D:\Program Files\nodejs;C:\Users\user\AppData\Roaming\npm;%PATH%"
cd /d "%~dp0"

echo [1/2] กำลังตรวจสอบสถานะและส่งโค้ดขึ้นคลาวด์...
call firebase deploy --only hosting

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================
    echo    ✅ สำเร็จ! อัปโหลดหน้าเว็บเวอร์ชันใหม่เรียบร้อยแล้ว
    echo    🌐 ลิงก์เว็บของคุณ: https://equipmentphayuha-e3f3f.web.app
    echo ======================================================
) else (
    echo.
    echo ======================================================
    echo    ❌ พบข้อผิดพลาด! กรุณาตรวจสอบว่าได้ทำการ login ไว้แล้วหรือไม่
    echo    (หากยังไม่เคย login ให้เปิด PowerShell แล้วพิมพ์: firebase login)
    echo ======================================================
)

echo.
pause
