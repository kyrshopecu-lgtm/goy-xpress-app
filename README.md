# GOY XPRESS Mobile (React Native / Expo)

## Incluye
- Colores corporativos y logotipo GOY XPRESS
- Perfil Cliente
- Perfil Administrador
- Perfil Mensajero
- Registro de envíos
- Cálculo de tarifa por zona
- Cobro contra entrega
- Registro de trámites
- Tarifa trámites: $6.50 hasta 40 min + $0.10/min adicional
- Notificación al WhatsApp del administrador
- Bandeja de solicitudes
- Asignación de mensajero
- Estados: pendiente, asignado, en ruta, finalizado
- Datos guardados localmente con AsyncStorage

## Importante sobre WhatsApp
En App.js cambia:
ADMIN_WHATSAPP = '593999999999'
por el número real del administrador en formato internacional, sin + ni espacios.

La versión incluida abre WhatsApp con un mensaje prellenado al crear una solicitud.
Para envío 100% automático sin intervención del usuario se necesita:
- WhatsApp Business Cloud API
- Backend seguro
- Token y número empresarial de Meta

No se deben colocar tokens de WhatsApp directamente dentro de la app móvil.

## Ejecutar
1. Instala Node.js.
2. En la carpeta del proyecto:
   npm install
3. Luego:
   npx expo start
4. Escanea el QR con Expo Go o abre Android/iOS.

## Para producción
Recomendado reemplazar AsyncStorage por:
- Supabase o Firebase
- Autenticación por usuario
- Base de datos en la nube
- Notificaciones push
- Google Maps
- Evidencia fotográfica
- Firma del receptor
- Reportes y liquidaciones


## Google Play
El proyecto incluye `eas.json`, assets Android, política de privacidad y guía `GOOGLE_PLAY.md` para generar APK/AAB.
