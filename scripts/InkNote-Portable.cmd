@echo off
setlocal
set "INKNOTE_DATA_DIR=%~dp0InkNoteData"
if not exist "%INKNOTE_DATA_DIR%" mkdir "%INKNOTE_DATA_DIR%"
start "" "%~dp0InkNote.exe"
endlocal
