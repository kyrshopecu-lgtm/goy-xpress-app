#!/usr/bin/env bash
set -euo pipefail
APK_PATH=${1:?APK requerida}
PACKAGE_NAME=${2:?Paquete Android requerido}
EVIDENCE_DIR=${3:-smoke-test}
EXPECTED_VERSION_NAME=4.0.0
EXPECTED_VERSION_CODE=1
ACTIVITY_NAME=.MainActivity
mkdir -p "$EVIDENCE_DIR"
capture(){ adb exec-out screencap -p > "$EVIDENCE_DIR/screen.png" 2>/dev/null || true; adb logcat -d > "$EVIDENCE_DIR/logcat.txt" 2>/dev/null || true; adb shell dumpsys package "$PACKAGE_NAME" > "$EVIDENCE_DIR/package.txt" 2>/dev/null || true; }
trap capture EXIT
adb install -r "$APK_PATH" | tee "$EVIDENCE_DIR/install.txt"
adb logcat -c
adb shell am force-stop "$PACKAGE_NAME"
adb shell am start -W -n "$PACKAGE_NAME/$ACTIVITY_NAME" | tee "$EVIDENCE_DIR/launch.txt"
sleep 35
APP_PID=$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r'); test -n "$APP_PID"
adb shell dumpsys activity activities > "$EVIDENCE_DIR/activity.txt"
grep -Eq "(topResumedActivity|mResumedActivity|ResumedActivity).*${PACKAGE_NAME}" "$EVIDENCE_DIR/activity.txt"
adb shell dumpsys package "$PACKAGE_NAME" > "$EVIDENCE_DIR/package.txt"
grep -q "versionCode=${EXPECTED_VERSION_CODE}" "$EVIDENCE_DIR/package.txt"
grep -q "versionName=${EXPECTED_VERSION_NAME}" "$EVIDENCE_DIR/package.txt"
adb exec-out screencap -p > "$EVIDENCE_DIR/screen.png"
python3 - "$EVIDENCE_DIR/screen.png" <<'PY'
import struct,sys
with open(sys.argv[1],'rb') as image:
    sig=image.read(8);image.read(8);w,h=struct.unpack('>II',image.read(8))
if sig!=b'\x89PNG\r\n\x1a\n' or w<200 or h<200: raise SystemExit('Captura Android inválida')
print(f'Captura válida: {w}x{h}')
PY
sleep 10
test "$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')" = "$APP_PID"
adb logcat -d > "$EVIDENCE_DIR/logcat.txt"
if grep -Eq "Cannot find native module|JavascriptException|Process $PACKAGE_NAME .*has died|>>> $PACKAGE_NAME <<<" "$EVIDENCE_DIR/logcat.txt"; then echo 'Error fatal detectado' >&2; exit 1; fi
echo "$PACKAGE_NAME superó instalación, versión, arranque, render y logcat."
