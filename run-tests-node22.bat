@echo off
setlocal
set PATH=C:\Users\jemde\AppData\Local\Temp\node22\node-v22.19.0-win-x64;%PATH%
echo NODE VERSION:
node --version 2>&1
echo.
echo === PROGRAM ENGINE TESTS ===
node node_modules\vitest\vitest.mjs run packages/program-engine/src/program-engine.test.ts 2>&1
echo.
echo === FULL UNIT SUITE ===
node node_modules\vitest\vitest.mjs run 2>&1
endlocal
