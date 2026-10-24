@echo off
setlocal
set "DSH=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"
if not exist "%DSH%" (
  echo DeepSeek Harness CLI was not found at the standard Desktop install path.
  echo See README.md for the manual install command.
  pause
  exit /b 1
)
echo Preparing the official yt-dlp video resolver...
"%NODE%" "%~dp0bin\prepare.mjs"
if errorlevel 1 (
  echo Resolver setup failed. See the message above.
  pause
  exit /b 1
)
echo Installing DSH Codex Vision from:
echo %~dp0
call "%DSH%" plugin --profile desktop add "%~dp0."
if errorlevel 1 (
  echo Installation failed. See the message above.
  pause
  exit /b 1
)
echo Installation completed. Reload the plugin in DSH or restart the app.
echo Send Codex a video URL to start watching with video_vision.
pause
