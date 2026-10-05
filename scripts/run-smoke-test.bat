@echo off
setlocal
set "ROOT=%~dp0.."
set "LOG=%~dp0run-log.txt"
cd /d "%ROOT%\backend"
del /q "%~dp0smoke-result.txt" "%~dp0backend.log" 2>nul
echo ===== run %date% %time% ===== > "%LOG%"

echo [1/5] Java check
java -version >> "%LOG%" 2>&1
if errorlevel 1 (echo JAVA NOT FOUND - install JDK 21 >> "%LOG%" & echo JAVA NOT FOUND & goto end)

echo [2/5] Docker engine check
docker info >nul 2>&1
if not errorlevel 1 goto dockerok
echo Docker engine not running - starting Docker Desktop >> "%LOG%"
echo Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ docker info *> $null; if($LASTEXITCODE -eq 0){ exit 0 }; Start-Sleep 5 }; exit 1"
if errorlevel 1 (echo DOCKER ENGINE DID NOT START in 5 min >> "%LOG%" & echo DOCKER ENGINE DID NOT START & goto end)
:dockerok
echo DOCKER OK >> "%LOG%"

echo [3/5] mysql + redis
set "DB_URL=jdbc:mysql://localhost:3306/naengjang_goat_db?useSSL=false&serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true"
docker compose up -d redis >> "%LOG%" 2>&1
if errorlevel 1 (echo REDIS FAILED >> "%LOG%" & echo REDIS FAILED & goto end)
powershell -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',3306); exit 0 } catch { exit 1 } finally { $c.Close() }"
if errorlevel 1 (
  echo port 3306 free - using compose mysql >> "%LOG%"
  docker compose up -d mysql >> "%LOG%" 2>&1
  set "MYSQL_CT=backend-mysql-1"
) else (
  echo port 3306 busy - starting separate test mysql on 3307 >> "%LOG%"
  docker rm -f backend-mysql-1 >nul 2>&1
  docker start goat-test-mysql >nul 2>&1 || docker run -d --name goat-test-mysql -e MYSQL_ROOT_PASSWORD=43214321 -e MYSQL_DATABASE=naengjang_goat_db -e MYSQL_CHARACTER_SET_SERVER=utf8mb4 -p 3307:3306 mysql:8.0 >> "%LOG%" 2>&1
  set "MYSQL_CT=goat-test-mysql"
  set "DB_URL=jdbc:mysql://localhost:3307/naengjang_goat_db?useSSL=false&serverTimezone=UTC&characterEncoding=UTF-8&allowPublicKeyRetrieval=true"
)
echo waiting for mysql...
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){ docker exec $env:MYSQL_CT mysqladmin ping -uroot -p43214321 --silent *> $null; if($LASTEXITCODE -eq 0){ Start-Sleep 3; exit 0 }; Start-Sleep 5 }; exit 1"
if errorlevel 1 (echo MYSQL NOT READY >> "%LOG%" & echo MYSQL NOT READY & goto end)
echo MYSQL OK - container %MYSQL_CT% >> "%LOG%"
docker ps --format "{{.Names}} {{.Status}} {{.Ports}}" >> "%LOG%" 2>&1

echo [4/5] Backend start (log: scripts\backend.log)
powershell -NoProfile -Command "try{Invoke-WebRequest http://localhost:8080/v3/api-docs -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0}catch{exit 1}"
if not errorlevel 1 (echo PORT 8080 ALREADY IN USE - testing the server that is already running >> "%LOG%" & goto smoke)
start "naengjang-backend" /min cmd /c "gradlew.bat bootRun > "%~dp0backend.log" 2>&1"
echo waiting for server (first run downloads Gradle, up to 10 min)...
powershell -NoProfile -Command "for($i=0;$i -lt 120;$i++){ try{ Invoke-WebRequest http://localhost:8080/v3/api-docs -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 }catch{ Start-Sleep 5 } }; exit 1"
if errorlevel 1 (echo SERVER DID NOT START - see scripts\backend.log >> "%LOG%" & echo SERVER DID NOT START & goto end)
echo SERVER UP >> "%LOG%"

:smoke
echo [5/5] Smoke test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0smoke-test.ps1" >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
type "%~dp0smoke-result.txt"

:end
echo.
echo Finished. Results: scripts\smoke-result.txt / scripts\run-log.txt
echo (backend keeps running in the minimized window)
pause
