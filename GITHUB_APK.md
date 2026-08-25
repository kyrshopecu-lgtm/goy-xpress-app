# Crear el APK de GOY XPRESS con GitHub

1. Activa Supabase y Twilio siguiendo `supabase/SETUP.md`.
2. En **Settings → Secrets and variables → Actions** agrega
   `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Abre la pestaña **Actions**.
4. Selecciona **Generar APK GOY XPRESS**.
5. Pulsa **Run workflow** y confirma con el botón verde.
6. Espera a que terminen la compilación y la prueba automática en Android.
7. Descarga **GOY-XPRESS-v3.2.1-INSTALABLE** en **Artifacts**.
8. Descomprime el archivo para obtener `GOY-XPRESS-v3.2.1-INSTALABLE.apk`.

El APK se puede instalar como actualización porque conserva el paquete
`com.goyxpress.mensajeria` e incrementa `versionCode` a 6. Antes de distribuir,
prueba un registro de cliente, un registro de mensajero y el flujo completo de
una solicitud real.
