@echo off
:: CMD 인코딩을 UTF-8로 설정하여 한글 깨짐 방지
chcp 65001 >nul

title 삼성 헌터스 - Firebase Functions 배포 도구
cls

echo ======================================================
echo   삼성 헌터스 오더 시스템: Functions 배포를 시작합니다.
echo ======================================================
echo.

:: 2. Functions 배포 실행
echo Functions 배포 명령 실행 (firebase deploy --only functions)
echo 배포 중에는 창을 닫지 마세요...
echo.

call firebase deploy --only functions

:: 3. 결과 확인
if %errorlevel% equ 0 (
    echo.
    echo ======================================================
    echo   성공: 모든 Functions가 정상적으로 배포되었습니다.
    echo ======================================================
) else (
    echo.
    echo ------------------------------------------------------
    echo   실패: 배포 중 오류가 발생했습니다. 로그를 확인하세요.
    echo ------------------------------------------------------
)

echo.
echo 작업을 마치려면 아무 키나 누르세요.
pause >nul