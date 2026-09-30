@echo off
setlocal
echo Creating the ChromaDial desktop shortcut...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$shell = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $shortcut = $shell.CreateShortcut([IO.Path]::Combine($desktop, 'ChromaDial.lnk')); $shortcut.TargetPath = '%~dp0Launch ChromaDial.cmd'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.IconLocation = '%~dp0assets\ChromaDial.ico'; $shortcut.Description = 'Offline RGB and CMYK colour-mixing game'; $shortcut.Save()"

if errorlevel 1 (
  echo.
  echo The shortcut could not be created. You can still use Launch ChromaDial.cmd.
  pause
  exit /b 1
)

echo.
echo ChromaDial is now available on your desktop.
pause
