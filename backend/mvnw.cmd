@ECHO OFF
REM ---------------------------------------------------------------------------
REM Minimal Maven Wrapper for ElevateMe backend (Maven 3.9.9) - Windows batch.
REM Reads .mvn\wrapper\maven-wrapper.properties, downloads + caches the
REM distribution under %%USERPROFILE%%\.m2\wrapper\dists on first use.
REM No wrapper jar is committed. Requires: Java 21, PowerShell (for download).
REM Usage (from backend\):  mvnw.cmd <maven-args...>
REM ---------------------------------------------------------------------------
SETLOCAL EnableDelayedExpansion

SET "SCRIPT_DIR=%~dp0"
SET "PROPS_FILE=%SCRIPT_DIR%.mvn\wrapper\maven-wrapper.properties"
SET "DISTRIBUTION_URL=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip"
IF EXIST "%PROPS_FILE%" (
  FOR /F "usebackq tokens=1* delims==" %%A IN ("%PROPS_FILE%") DO (
    IF "%%A"=="distributionUrl" SET "DISTRIBUTION_URL=%%B"
  )
)

SET "DIST_DIR_NAME=apache-maven-3.9.9"
SET "M2_HOME_DIR=%USERPROFILE%\.m2"
IF DEFINED MAVEN_USER_HOME SET "M2_HOME_DIR=%MAVEN_USER_HOME%"
SET "CACHE_DIR=%M2_HOME_DIR%\wrapper\dists\%DIST_DIR_NAME%"
SET "MARKER=%CACHE_DIR%\.unpacked-ok"
SET "MVN_BIN=%CACHE_DIR%\%DIST_DIR_NAME%\bin\mvn.cmd"

REM --- 1. Java prerequisite check (pom needs Java 21) -----------------------
WHERE java >NUL 2>&1
IF ERRORLEVEL 1 (
  ECHO ERROR: 'java' not found on PATH. Install Java 21 and retry. 1>&2
  ECHO Verify with: java -version   ^(expect openjdk 21^) 1>&2
  EXIT /B 1
)
FOR /F "tokens=3" %%V IN ('java -version 2^>^&1 ^| FINDSTR /I "version"') DO (
  SET "JAVA_VER=%%V"
  GOTO :gotver
)
:gotver
REM JAVA_VER looks like "21.0.x" with quotes; strip quotes
SET "JAVA_VER=%JAVA_VER:"=%"
FOR /F "delims=. tokens=1" %%M IN ("%JAVA_VER%") DO SET "JAVA_MAJOR=%%M"
IF NOT "%JAVA_MAJOR%"=="21" (
  ECHO WARNING: pom.xml requires Java 21 but java -version reports %JAVA_VER%. 1>&2
  IF NOT "%MVNW_ALLOW_WRONG_JDK%"=="1" (
    ECHO Set MVNW_ALLOW_WRONG_JDK=1 to bypass this check ^(not recommended^). 1>&2
    EXIT /B 2
  )
)

REM --- 2. Download + unpack on first use ------------------------------------
IF NOT EXIST "%MARKER%" (
  IF NOT EXIST "%CACHE_DIR%" MKDIR "%CACHE_DIR%"
  ECHO Downloading Maven 3.9.9 from %DISTRIBUTION_URL% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url='%DISTRIBUTION_URL%'; $zip='%CACHE_DIR%\apache-maven-3.9.9-bin.zip';" ^
    " [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    " Invoke-WebRequest -Uri $url -OutFile $zip;" ^
    " Expand-Archive -Path $zip -DestinationPath '%CACHE_DIR%' -Force;" ^
    " Remove-Item $zip; New-Item -ItemType File -Path '%MARKER%' -Force | Out-Null"
  IF ERRORLEVEL 1 (
    ECHO ERROR: Maven distribution download/unpack failed. 1>&2
    EXIT /B 1
  )
)

IF NOT EXIST "%MVN_BIN%" (
  ECHO ERROR: expected mvn at %MVN_BIN% ^(cache may be corrupt; delete %CACHE_DIR% and retry^). 1>&2
  EXIT /B 1
)

CALL "%MVN_BIN%" %*
