#!/usr/bin/env bash
set -euo pipefail

APK_PATH=${1:?Debes indicar la ruta de la APK}
EVIDENCE_DIR=${2:-smoke-test}
PACKAGE_NAME=com.goyxpress.mensajeria
ACTIVITY_NAME=.MainActivity
UI_XML="$EVIDENCE_DIR/window.xml"

mkdir -p "$EVIDENCE_DIR"

dump_ui() {
  rm -f "$UI_XML"
  adb shell rm -f /sdcard/goy-window.xml >/dev/null 2>&1 || true
  timeout 15s adb shell uiautomator dump /sdcard/goy-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/goy-window.xml "$UI_XML" >/dev/null 2>&1 || true
}

dismiss_system_dialog() {
  local point
  local attempt
  for attempt in 1 2 3; do
    if ! python3 scripts/ui_point.py "$UI_XML" "isn't responding" >/dev/null; then
      return 0
    fi
    point=$(python3 scripts/ui_point.py "$UI_XML" "Wait" || true)
    if [ -z "$point" ]; then
      return 0
    fi
    echo "Descartando aviso del System UI del emulador"
    adb shell input tap $point
    sleep 3
    dump_ui
  done
}

capture_evidence() {
  dump_ui
  adb exec-out screencap -p > "$EVIDENCE_DIR/screen.png" 2>/dev/null || true
  adb logcat -d > "$EVIDENCE_DIR/logcat.txt" 2>/dev/null || true
  adb shell dumpsys activity activities > "$EVIDENCE_DIR/activity.txt" 2>/dev/null || true
}

trap capture_evidence EXIT

wait_for_text() {
  local needle=$1
  local attempt
  for attempt in $(seq 1 10); do
    if ! adb shell pidof "$PACKAGE_NAME" >/dev/null; then
      echo "El proceso de GOY XPRESS se cerró durante la prueba" >&2
      return 1
    fi
    dump_ui
    dismiss_system_dialog
    if python3 scripts/ui_point.py "$UI_XML" "$needle" >/dev/null; then
      return 0
    fi
    sleep 3
  done
  echo "No apareció el texto esperado: $needle" >&2
  return 1
}

tap_text() {
  local needle=$1
  local point
  wait_for_text "$needle"
  point=$(python3 scripts/ui_point.py "$UI_XML" "$needle")
  adb shell input tap $point
  sleep 2
}

adb install -r "$APK_PATH" | tee "$EVIDENCE_DIR/install.txt"
adb logcat -c
adb shell am force-stop "$PACKAGE_NAME"
adb shell am start -W -n "$PACKAGE_NAME/$ACTIVITY_NAME" | tee "$EVIDENCE_DIR/launch.txt"
sleep 8

wait_for_text "Hola, emprendedor"
tap_text "Servicios"
wait_for_text "Servicios GOY XPRESS"
tap_text "Mensajería ejecutiva"
wait_for_text "Tarifa clara"
wait_for_text "40 minutos de espera"
tap_text "Administrador"
wait_for_text "Panel administrador"
tap_text "Mensajero"
wait_for_text "Mis asignaciones"

APP_PID=$(adb shell pidof "$PACKAGE_NAME" | tr -d '\r')
test -n "$APP_PID"

adb logcat -d > "$EVIDENCE_DIR/logcat.txt"
if grep -Eq "Cannot find native module|JavascriptException|Process $PACKAGE_NAME .*has died|Cmdline: $PACKAGE_NAME|>>> $PACKAGE_NAME <<<" "$EVIDENCE_DIR/logcat.txt"; then
  echo "Se detectó un error fatal durante la prueba" >&2
  exit 1
fi

echo "GOY XPRESS superó arranque, navegación, formulario ejecutivo y cambio de roles."
