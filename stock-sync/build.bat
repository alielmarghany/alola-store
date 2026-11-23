@echo off
rem Builds AlolaStockSync.exe (the window) and AlolaStockSync-cli.exe (commands) into the dist folder.
rem Needs Python 3.11 or newer from python.org, with "Add to PATH" ticked.
cd /d "%~dp0"
python -m pip install -r requirements.txt || goto :fail
python -m PyInstaller --noconfirm --onefile --windowed --name AlolaStockSync alola_stock_sync.py || goto :fail
python -m PyInstaller --noconfirm --onefile --console --name AlolaStockSync-cli alola_stock_sync.py || goto :fail
if not exist dist\config.json copy config.example.json dist\config.json
copy /y config.example.json dist\config.example.json >nul
echo.
echo Done. Copy the dist folder to C:\AlolaSync and fill in config.json.
pause
exit /b 0
:fail
echo Build failed.
pause
exit /b 1
