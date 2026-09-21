@echo off
setlocal
cd /d "C:\dev\fitness_app"
set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update Lift"
echo.
echo === About to publish. Nothing unexpected should be listed here: ===
git status --short
echo.
node tools\prepublish.js
if errorlevel 1 goto :end
git add -A
git commit -m "%MSG%"
if errorlevel 1 echo (nothing to commit)
git push
echo.
echo Done. Live in a minute or two:  https://ziadelwali.github.io/lift/
echo On the phone: open it once online; a new version installs in the background and shows on the NEXT open.
:end
pause
