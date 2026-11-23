@echo off
rem Starts Alola Stock Sync when this Windows user logs in. Run it once from the folder with AlolaStockSync.exe.
cd /d "%~dp0"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AlolaStockSync /t REG_SZ /d "\"%~dp0AlolaStockSync.exe\"" /f
echo Alola Stock Sync will start when you log in.
pause
