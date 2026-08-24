# Publicar GOY XPRESS en Google Play

## 1. Datos que debes cambiar antes de publicar
En `App.js` cambia:
`ADMIN_WHATSAPP = '593999999999'`
por el número real del administrador, en formato internacional sin `+`, espacios ni guiones.

En `privacy-policy.html` agrega el correo oficial de soporte y privacidad.

## 2. Instalar herramientas
Instala Node.js y luego ejecuta:
```bash
npm install
npm install -g eas-cli
```

## 3. Crear/configurar proyecto Expo
```bash
eas login
eas build:configure
```

Si Expo crea un `projectId`, reemplaza el valor temporal dentro de `app.json`.

## 4. Probar APK
```bash
eas build --platform android --profile preview
```

Esto genera un APK para instalar y probar antes de publicar.

## 5. Generar AAB para Google Play
```bash
eas build --platform android --profile production
```

El resultado será un archivo `.aab`.

## 6. Publicar
En Google Play Console:
- Crear aplicación
- Completar ficha de tienda
- Agregar política de privacidad
- Completar seguridad de datos
- Completar clasificación de contenido
- Crear versión de producción
- Subir el `.aab`
- Enviar a revisión

## Importante
La notificación actual usa un enlace de WhatsApp con el mensaje prellenado.
Para envío automático sin intervención del usuario se requiere WhatsApp Business Cloud API y un backend seguro.

Nunca pongas tokens secretos de WhatsApp Business dentro de `App.js`.
