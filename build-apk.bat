@echo off
setlocal

set "ROOT=%~dp0"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_DIR=%ROOT%android-probe"
set "PUBLIC_APK=%ROOT%website\public\时差观赛.apk"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] Android Studio JDK not found: %JAVA_HOME%
  exit /b 1
)

if not exist "%ANDROID_DIR%\gradlew.bat" (
  echo [ERROR] gradlew.bat not found: %ANDROID_DIR%
  exit /b 1
)

set "PATH=%JAVA_HOME%\bin;%PATH%"

pushd "%ANDROID_DIR%"
call gradlew.bat assembleRelease
if errorlevel 1 (
  popd
  echo [ERROR] APK build failed.
  exit /b 1
)
popd

for /f "delims=" %%F in ('powershell -NoProfile -Command "Get-ChildItem -Path '%ANDROID_DIR%\app\build\outputs\apk' -Recurse -Filter *.apk | Where-Object { $_.FullName -notmatch 'androidTest' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName"') do set "LATEST_APK=%%F"

if not defined LATEST_APK (
  echo [ERROR] No APK output found.
  exit /b 1
)

copy /Y "%LATEST_APK%" "%PUBLIC_APK%" >nul

echo.
echo [OK] Built APK: %LATEST_APK%
echo [OK] Synced APK: %PUBLIC_APK%
echo [TIP] If you want to upload it now, run: node gx --apk
