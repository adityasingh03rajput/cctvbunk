@echo off
setlocal enabledelayedexpansion

REM ===================================================
REM CONFIGURATION: Set your wireless device IP here to
REM skip the prompt and always install to this IP.
REM Example: set DEFAULT_IP=192.168.1.10
REM ===================================================
set DEFAULT_IP=

echo ========================================
echo LetsBunk Offline-BSSID Build and Install
echo ========================================
echo.

REM Step 1: Cleanup old APKs (no uninstall - preserves permissions)
echo Step 1: Removing old APKs...
del /S /F /Q *.apk >nul 2>&1
echo ✅ Cleanup complete
echo.

REM Step 2: Build
echo Step 2: Building (Fast Mode)...
echo This may take a few minutes...
cd android
call gradlew assembleRelease --no-daemon
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

REM Step 3: Install
set APK_PATH=android\app\build\outputs\apk\release\app-release.apk
if not exist "%APK_PATH%" (
    echo ❌ APK not found at: %APK_PATH%
    pause
    exit /b 1
)

echo ✅ APK ready: %APK_PATH%

set INSTALL_SUCCESS=0

REM If a default IP is configured, use it
if not "%DEFAULT_IP%"=="" (
    echo Connecting to configured IP: %DEFAULT_IP%:5555...
    adb connect %DEFAULT_IP%:5555 >nul 2>&1
    timeout /t 2 >nul
    if exist "%~dp0.last_adb_ip" (
        findstr /x "%DEFAULT_IP%" "%~dp0.last_adb_ip" >nul 2>&1
        if !ERRORLEVEL! NEQ 0 echo %DEFAULT_IP%>> "%~dp0.last_adb_ip"
    ) else (
        echo %DEFAULT_IP%> "%~dp0.last_adb_ip"
    )
) else (
    REM Check for USB-connected devices and auto-configure wireless mode
    for /f "tokens=1" %%i in ('adb devices') do (
        set "LINE=%%i"
        if not "!LINE!"="" if not "!LINE!"=="List" if not "!LINE!"=="of" if not "!LINE!"=="devices" (
            REM Check if it is a USB/emulator device (no dots)
            if "!LINE!"=="!LINE:.=!" (
                echo 🔌 USB device detected: !LINE!. Checking Wi-Fi IP address...
                set "DEVICE_IP="
                for /f "tokens=9" %%a in ('adb -s !LINE! shell ip route 2^>nul ^| findstr "src"') do (
                    set "TEMP_IP=%%a"
                    if not "!TEMP_IP!"=="!TEMP_IP:192.168.=!" set "DEVICE_IP=!TEMP_IP!"
                    if not "!TEMP_IP!"=="!TEMP_IP:172.=!" set "DEVICE_IP=!TEMP_IP!"
                    if not "!TEMP_IP!"=="!TEMP_IP:10.=!" (
                        if "!DEVICE_IP!"=="" set "DEVICE_IP=!TEMP_IP!"
                    )
                )
                if not "!DEVICE_IP!"=="" (
                    echo Found Device IP: !DEVICE_IP!
                    echo Enabling wireless debugging on port 5555...
                    adb -s !LINE! tcpip 5555 >nul 2>&1
                    timeout /t 2 >nul
                    echo Connecting wirelessly to !DEVICE_IP!:5555...
                    adb connect !DEVICE_IP!:5555 >nul 2>&1
                    
                    REM Save IP uniquely
                    if exist "%~dp0.last_adb_ip" (
                        findstr /x "!DEVICE_IP!" "%~dp0.last_adb_ip" >nul 2>&1
                        if !ERRORLEVEL! NEQ 0 echo !DEVICE_IP!>> "%~dp0.last_adb_ip"
                    ) else (
                        echo !DEVICE_IP!> "%~dp0.last_adb_ip"
                    )
                )
            )
        )
    )
)

REM If no wireless devices are currently active, try reconnecting to all saved IPs
set WIRELESS_ACTIVE=0
for /f "tokens=1" %%i in ('adb devices') do (
    set "LINE=%%i"
    if not "!LINE!"="" if not "!LINE!"=="List" if not "!LINE!"=="of" if not "!LINE!"=="devices" (
        if not "!LINE!"=="!LINE:.=!" (
            set WIRELESS_ACTIVE=1
        )
    )
)

if "!WIRELESS_ACTIVE!"=="0" (
    if exist "%~dp0.last_adb_ip" (
        echo 📡 Reconnecting to saved wireless devices...
        for /f "usebackq tokens=*" %%g in ("%~dp0.last_adb_ip") do (
            set "SAVED_IP=%%g"
            set "SAVED_IP=!SAVED_IP: =!"
            if not "!SAVED_IP!"=="" (
                echo Connecting to !SAVED_IP!:5555...
                adb connect !SAVED_IP!:5555 >nul 2>&1
            )
        )
        timeout /t 2 >nul
    )
)

REM Collect final list of active wireless and USB devices
set HAS_WIRELESS=0
set HAS_USB=0

for /f "tokens=1" %%i in ('adb devices') do (
    set "LINE=%%i"
    if not "!LINE!"="" if not "!LINE!"=="List" if not "!LINE!"=="of" if not "!LINE!"=="devices" (
        if not "!LINE!"=="!LINE:.=!" (
            set HAS_WIRELESS=1
        ) else (
            set HAS_USB=1
        )
    )
)

REM Install phase
if "!HAS_WIRELESS!"=="1" (
    echo.
    echo 📱 Wireless devices detected. Installing to wireless devices...
    for /f "tokens=1" %%i in ('adb devices') do (
        set "LINE=%%i"
        if not "!LINE!"="" if not "!LINE!"=="List" if not "!LINE!"=="of" if not "!LINE!"=="devices" (
            if not "!LINE!"=="!LINE:.=!" (
                echo 🚀 Installing wirelessly to !LINE!...
                adb -s !LINE! install -r "%APK_PATH%"
                if !ERRORLEVEL! EQU 0 set INSTALL_SUCCESS=1
            )
        )
    )
) else if "!HAS_USB!"=="1" (
    echo.
    echo 🔌 USB/Emulator devices detected. Installing directly...
    for /f "tokens=1" %%i in ('adb devices') do (
        set "LINE=%%i"
        if not "!LINE!"="" if not "!LINE!"=="List" if not "!LINE!"=="of" if not "!LINE!"=="devices" (
            if "!LINE!"=="!LINE:.=!" (
                echo 🚀 Installing directly to !LINE!...
                adb -s !LINE! install -r "%APK_PATH%"
                if !ERRORLEVEL! EQU 0 set INSTALL_SUCCESS=1
            )
        )
    )
) else (
    echo ⚠️ No active device connected.
    set /p USER_IP="Enter device IP (e.g. 192.168.1.10) to connect, or press Enter to skip: "
    if not "!USER_IP!"=="" (
        set "USER_IP=!USER_IP: =!"
        echo Connecting to !USER_IP!:5555...
        adb connect !USER_IP!:5555
        timeout /t 2 >nul
        
        for /f "tokens=1" %%i in ('adb devices') do (
            set "LINE=%%i"
            if "!LINE!"=="!USER_IP!:5555" (
                echo 🚀 Connected! Installing to !LINE!...
                adb -s !LINE! install -r "%APK_PATH%"
                if !ERRORLEVEL! EQU 0 set INSTALL_SUCCESS=1
                
                REM Save IP uniquely
                if exist "%~dp0.last_adb_ip" (
                    findstr /x "!USER_IP!" "%~dp0.last_adb_ip" >nul 2>&1
                    if !ERRORLEVEL! NEQ 0 echo !USER_IP!>> "%~dp0.last_adb_ip"
                ) else (
                    echo !USER_IP!> "%~dp0.last_adb_ip"
                )
            )
        )
    )
)

if "!INSTALL_SUCCESS!"=="1" (
    echo.
    echo ========================================
    echo ✅ SUCCESS! APK installed on device(s)
    echo ========================================
) else (
    echo.
    echo ⚠️ Install failed or skipped. Check connection status.
)

echo.
pause
