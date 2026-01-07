@echo off
echo Launching Chrome with remote debugging enabled...
echo.
echo NOTE: Close all existing Chrome windows first!
echo.

:: Try common Chrome locations
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
    goto :done
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
    goto :done
)

if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
    goto :done
)

echo Chrome not found in standard locations.
echo Please modify this script with your Chrome installation path.
pause
exit /b 1

:done
echo Chrome launched with debugging on port 9222
echo You can now use Albert's research features!
timeout /t 3
