@echo off
REM ============================================================================
REM  dev-restart.cmd — relança el backend (Go) i el frontend (Vite) en local.
REM
REM  Fa:
REM    1. mata el que escolta als ports 3001 (api) i 5173 (vite)
REM    2. recompila el backend amb `go build` -> %TEMP%\finances-server.exe
REM    3. llança el backend en background amb APP_PASSWORD_HASH
REM    4. llança el frontend (`pnpm dev`) en background
REM    5. logs a %TEMP%\finances-logs\
REM
REM  Us:
REM    scripts\dev-restart.cmd                REM  backend + frontend
REM    scripts\dev-restart.cmd backend        REM  només backend
REM    scripts\dev-restart.cmd web            REM  només frontend
REM    scripts\dev-restart.cmd --help         REM  ajuda
REM
REM  Variables d'entorn opcionals:
REM    APP_PASSWORD_HASH    bcrypt hash per al login (default: "finances")
REM    GO_BIN               ruta al go.exe (default: C:\Program Files\Go\bin\go.exe)
REM ============================================================================

setlocal EnableExtensions

REM ---- config -----------------------------------------------------------------
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "BACKEND_DIR=%REPO_ROOT%\backend"
set "WEB_DIR=%REPO_ROOT%\apps\web"
set "BIN_PATH=%TEMP%\finances-server.exe"
set "LOG_DIR=%TEMP%\finances-logs"

if "%APP_PASSWORD_HASH%"=="" (
    set "APP_PASSWORD_HASH=$2a$10$UOnIpxpZaDHM7ps65RZTj.trYBmU6ybIHtz/SAjfR1vmkuKajSEMS"
)
if "%GO_BIN%"=="" set "GO_BIN=C:\Program Files\Go\bin\go.exe"

REM ---- parse args -------------------------------------------------------------
set "DO_BACKEND=1"
set "DO_WEB=1"
set "NEED_HELP=0"
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="backend" ( set "DO_BACKEND=1" & set "DO_WEB=0"
) else if /i "%~1"=="web" ( set "DO_BACKEND=0" & set "DO_WEB=1"
) else if /i "%~1"=="all" ( set "DO_BACKEND=1" & set "DO_WEB=1"
) else if /i "%~1"=="-h" ( set "NEED_HELP=1"
) else if /i "%~1"=="--help" ( set "NEED_HELP=1"
) else (
    echo [ERROR] argument desconegut: %~1
    echo         Usa --help per veure les opcions.
    exit /b 2
)
shift
goto :parse_args

:args_done
if "%NEED_HELP%"=="1" goto :show_help

REM ---- header -----------------------------------------------------------------
echo.
echo === Finances dev-restart ===
echo     backend  port 3001  (DO_BACKEND=%DO_BACKEND%)
echo     web      port 5173  (DO_WEB=%DO_WEB%)
echo     logs     %LOG_DIR%
echo.

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM ============================================================================
REM  backend
REM ============================================================================
if "%DO_BACKEND%"=="1" (
    echo [backend] aturant...
    set "KILLED=0"
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
        echo     killing PID %%P ^(port 3001^)
        taskkill /F /PID %%P >nul 2>&1
        if not errorlevel 1 set "KILLED=1"
    )
    if "%KILLED%"=="0" echo     ^(ningu escolta a :3001^)
    timeout /t 2 /nobreak >nul

    echo [backend] compilant...
    pushd "%BACKEND_DIR%" >nul
    if not exist "%GO_BIN%" (
        echo     [WARN] no trobo "%GO_BIN%"; provant `go` al PATH...
        set "GO_BIN=go"
    )
    "%GO_BIN%" build -o "%BIN_PATH%" ./cmd/server
    if errorlevel 1 (
        popd
        echo     [ERROR] go build ha fallat
        exit /b 1
    )
    popd >nul
    echo     ^>^> %BIN_PATH%

    echo [backend] arrencant (logs: %LOG_DIR%\backend.log)
    pushd "%BACKEND_DIR%" >nul
    start "finances-backend" /B "%BIN_PATH%" 1> "%LOG_DIR%\backend.log" 2> "%LOG_DIR%\backend.err"
    popd >nul

    REM espera el port amb un bucle finit (for /l evita problemes amb set /a)
    set "BE_UP=0"
    for /l %%I in (1,1,15) do (
        netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
        if not errorlevel 1 (
            set "BE_UP=1"
            goto :be_wait_done
        )
        timeout /t 1 /nobreak >nul
    )
    :be_wait_done
    if "%BE_UP%"=="0" echo     [WARN] el port 3001 no ha pujat en 15s
    set "BE_UP="
)

REM ============================================================================
REM  web
REM ============================================================================
if "%DO_WEB%"=="1" (
    echo [web] aturant...
    set "KILLED=0"
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
        echo     killing PID %%P ^(port 5173^)
        taskkill /F /PID %%P >nul 2>&1
        if not errorlevel 1 set "KILLED=1"
    )
    if "%KILLED%"=="0" echo     ^(ningu escolta a :5173^)
    timeout /t 2 /nobreak >nul

    echo [web] arrencant (logs: %LOG_DIR%\web.log)
    pushd "%WEB_DIR%" >nul
    start "finances-web" /B cmd.exe /c "pnpm dev > %LOG_DIR%\web.log 2>&1"
    popd >nul

    set "WE_UP=0"
    for /l %%I in (1,1,20) do (
        netstat -ano | findstr :5173 | findstr LISTENING >nul 2>&1
        if not errorlevel 1 (
            set "WE_UP=1"
            goto :we_wait_done
        )
        timeout /t 1 /nobreak >nul
    )
    :we_wait_done
    if "%WE_UP%"=="0" echo     [WARN] el port 5173 no ha pujat en 20s
    set "WE_UP="
)

echo.
echo === fet ===
echo     api:   http://localhost:3001/health
echo     web:   http://localhost:5173
echo     logs:  %LOG_DIR%
echo.
exit /b 0

REM ============================================================================
REM  help
REM ============================================================================
:show_help
echo dev-restart.cmd - relança backend i/o frontend en local.
echo.
echo Us:
echo     scripts\dev-restart.cmd                backend + frontend
echo     scripts\dev-restart.cmd backend        nomes backend
echo     scripts\dev-restart.cmd web            nomes frontend
echo     scripts\dev-restart.cmd --help         aquesta ajuda
echo.
echo Variables d'entorn opcionals:
echo     APP_PASSWORD_HASH    bcrypt hash per al login ^(default: "finances"^)
echo     GO_BIN               ruta al go.exe
echo.
exit /b 0