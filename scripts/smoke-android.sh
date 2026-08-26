#!/usr/bin/env bash
set -euo pipefail

APK_PATH=${1:?Debes indicar la ruta de la APK}
EVIDENCE_DIR=${2:-smoke-test}
PACKAGE_NAME=$(node -p "require('./app.json').expo.android.package")
ACTIVITY_NAME=.MainActivity
UI_XML="$EVIDENCE_DIR/window.xml"

EXPECTED_VERSION_NAME=$(node -p "require('./app.json').expo.version")
EXPECTED_VERSION_CODE=$(node -p "require('./app.json').expo.android.versionCode")

mkdir -p "$EVIDENCE_DIR"

capture_evidence() {
  timeout 15s adb shell uiautomator dump /sdcard/goy-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/goy-window.xml "$UI_XML" >/dev/null 2>&1 || true
  adb exec-out screencap -p > "$EVIDENCE_DIR/screen.png" 2>/dev/null || true
  adb logcat -d > "$EVIDENCE_DIR/logcat.txt" 2>/dev/null || true
  adb shell dumpsys activity activities > "$EVIDENCE_DIR/activity.txt" 2>/dev/null || true
  adb shell dumpsys package "$PACKAGE_NAME" > "$EVIDENCE_DIR/package.txt" 2>/dev/null || true
}

trap capture_evidence EXIT

adb install -r "$APK_PATH" | tee "$EVIDENCE_DIR/install.txt"
adb logcat -c
adb shell am force-stop "$PACKAGE_NAME"
adb shell am start -W -n "$PACKAGE_NAME/$ACTIVITY_NAME" | tee "$EVIDENCE_DIR/launch.txt"
sleep 35

APP_PID=$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')
test -n "$APP_PID"

adb shell dumpsys activity activities > "$EVIDENCE_DIR/activity.txt"
grep -Eq "(topResumedActivity|mResumedActivity|ResumedActivity).*${PACKAGE_NAME}" "$EVIDENCE_DIR/activity.txt"

adb shell dumpsys package "$PACKAGE_NAME" > "$EVIDENCE_DIR/package.txt"
grep -q "versionCode=${EXPECTED_VERSION_CODE}" "$EVIDENCE_DIR/package.txt"
grep -q "versionName=${EXPECTED_VERSION_NAME}" "$EVIDENCE_DIR/package.txt"

adb exec-out screencap -p > "$EVIDENCE_DIR/screen.png"
python3 - "$EVIDENCE_DIR/screen.png" <<'PY'
import struct
import sys
with open(sys.argv[1], 'rb') as image:
    signature = image.read(8)
    image.read(8)
    width, height = struct.unpack('>II', image.read(8))
if signature != b'\x89PNG\r\n\x1a\n' or width < 200 or height < 200:
    raise SystemExit('La captura Android no es válida')
print(f'Captura Android válida: {width}x{height}')
PY

sleep 10
test "$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')" = "$APP_PID"

adb logcat -d > "$EVIDENCE_DIR/logcat.txt"
if grep -Eq "Cannot find native module|JavascriptException|Process $PACKAGE_NAME .*has died|Cmdline: $PACKAGE_NAME|>>> $PACKAGE_NAME <<<" "$EVIDENCE_DIR/logcat.txt"; then
  echo "Se detectó un error fatal durante la prueba" >&2
  exit 1
fi

echo "$PACKAGE_NAME superó instalación, versión ${EXPECTED_VERSION_NAME} (${EXPECTED_VERSION_CODE}), arranque sostenido, actividad, render y logcat."
