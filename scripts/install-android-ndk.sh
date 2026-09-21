#!/usr/bin/env bash

set -euo pipefail

NDK_VERSION="${1:-27.1.12297006}"
ANDROID_SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"

if [[ -z "$ANDROID_SDK_DIR" || "$ANDROID_SDK_DIR" != /* ]]; then
  echo "ANDROID_SDK_ROOT o ANDROID_HOME debe contener una ruta absoluta." >&2
  exit 1
fi

if [[ ! "$NDK_VERSION" =~ ^[0-9]+([.][0-9]+)+$ ]]; then
  echo "Versión NDK inválida: $NDK_VERSION" >&2
  exit 1
fi

NDK_DIR="$ANDROID_SDK_DIR/ndk/$NDK_VERSION"
if [[ -f "$NDK_DIR/source.properties" ]]; then
  echo "NDK $NDK_VERSION ya está instalado."
  exit 0
fi

SDK_MANAGER=""
for candidate in \
  "$ANDROID_SDK_DIR/cmdline-tools/latest/bin/sdkmanager" \
  "$ANDROID_SDK_DIR/cmdline-tools/bin/sdkmanager"
do
  if [[ -x "$candidate" ]]; then
    SDK_MANAGER="$candidate"
    break
  fi
done

if [[ -z "$SDK_MANAGER" ]]; then
  SDK_MANAGER="$(command -v sdkmanager || true)"
fi

if [[ -z "$SDK_MANAGER" ]]; then
  echo "No se encontró sdkmanager en el SDK de Android." >&2
  exit 1
fi

for attempt in 1 2 3 4; do
  echo "Instalando NDK $NDK_VERSION (intento $attempt de 4)..."

  if (( attempt > 1 )); then
    # El instalador puede dejar un ZIP parcial después de un error de red.
    rm -rf -- "$NDK_DIR" "$ANDROID_SDK_DIR/.temp"
  fi

  if "$SDK_MANAGER" --install "ndk;$NDK_VERSION" \
    && [[ -f "$NDK_DIR/source.properties" ]]; then
    echo "NDK $NDK_VERSION instalado y validado."
    exit 0
  fi

  if (( attempt < 4 )); then
    sleep $((attempt * 5))
  fi
done

echo "No se pudo instalar NDK $NDK_VERSION después de 4 intentos." >&2
exit 1
