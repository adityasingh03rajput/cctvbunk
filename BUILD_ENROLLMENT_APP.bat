@echo off
setlocal enabledelayedexpansion

echo ========================================
echo LetsBunk Enrollment App - APK Builder
echo ========================================
echo.

echo Step 1: Building Enrollment App...
cd enrollment-app
call gradlew assembleDebug --no-daemon
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Build failed!
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo ✅ Build completed successfully!

set APK_PATH=enrollment-app\app\build\outputs\apk\debug\app-debug.apk
if not exist "%APK_PATH%" (
    echo ❌ APK not found at: %APK_PATH%
    pause
    exit /b 1
)

echo.
echo ========================================
echo 🎉 SUCCESS! Enrollment App APK is ready:
echo %CD%\%APK_PATH%
echo ========================================
echo.
pause
