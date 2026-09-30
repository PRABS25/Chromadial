@echo off
setlocal
set "APP_FILE=%~dp0index.html"
set "EDGE_X86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE_X64=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_X86%" (
  start "ChromaDial" "%EDGE_X86%" --app="file:///%APP_FILE:\=/%" --start-maximized
  exit /b 0
)

if exist "%EDGE_X64%" (
  start "ChromaDial" "%EDGE_X64%" --app="file:///%APP_FILE:\=/%" --start-maximized
  exit /b 0
)

start "ChromaDial" "%APP_FILE%"
