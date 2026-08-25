#!/usr/bin/env bash
set -euo pipefail

APK_PATH=${1:?Debes indicar la ruta de la APK}
EVIDENCE_DIR=${2:-smoke-test}
PACKAGE_NAME=com.goyxpress.mensajeria
ACTIVITY_NAME=.MainActivity
UI_XML="$EVIDENCE_DIR/window.xml"

mkdir -p "$EVIDENCE_DIR"

dump_ui() {
  timeout 15s adb shell uiautomator dump /sdcard/goy-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/goy-window.xml "$UI_XML" >/dev/null 2>&1 || true
}

tap_text() {
  local target=${1:?Debes indicar el texto que se va a pulsar}
  local coordinates
  local tap_x
  local tap_y

  coordinates=$(python3 - "$UI_XML" "$target" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

tree = ET.parse(sys.argv[1])
target = sys.argv[2]

for node in tree.iter('node'):
    if node.attrib.get('text') != target:
        continue
    bounds = [int(value) for value in re.findall(r'\d+', node.attrib.get('bounds', ''))]
    if len(bounds) == 4:
        left, top, right, bottom = bounds
        print((left + right) // 2, (top + bottom) // 2)
        raise SystemExit(0)

raise SystemExit(f'No se encontró el control: {target}')
PY
  )

  read -r tap_x tap_y <<< "$coordinates"
  adb shell input tap "$tap_x" "$tap_y"
}

capture_evidence() {
  dump_ui
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

dump_ui
if grep -Fq "System UI isn't responding" "$UI_XML"; then
  tap_text "Wait"
  sleep 5
  dump_ui
fi

grep -Fq 'text="GOY XPRESS"' "$UI_XML"
grep -Fq 'text="Ingresar"' "$UI_XML"
grep -Fq 'text="Administrador"' "$UI_XML"
if grep -Fq 'Activación pendiente' "$UI_XML"; then
  echo "La compilación no recibió la configuración pública de Supabase" >&2
  exit 1
fi

tap_text "Administrador"
sleep 4
dump_ui
grep -Fq 'text="Administración privada"' "$UI_XML"
grep -Fq 'text="Usuario"' "$UI_XML"
grep -Fq 'text="Contraseña"' "$UI_XML"
grep -Fq 'text="Ingresar como administrador"' "$UI_XML"

adb shell dumpsys activity activities > "$EVIDENCE_DIR/activity.txt"
grep -Eq "(topResumedActivity|mResumedActivity|ResumedActivity).*${PACKAGE_NAME}" "$EVIDENCE_DIR/activity.txt"

adb shell dumpsys package "$PACKAGE_NAME" > "$EVIDENCE_DIR/package.txt"
grep -q "versionCode=6" "$EVIDENCE_DIR/package.txt"
grep -q "versionName=3.2.0" "$EVIDENCE_DIR/package.txt"

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

echo "GOY XPRESS v3.2.0 superó instalación, versión, arranque sostenido, actividad, render y logcat."
