@echo off
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AlolaStockSync /f
echo Alola Stock Sync will no longer start with Windows.
pause
