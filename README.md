# GOY XPRESS Mobile 3.0

Aplicación móvil en React Native y Expo para la operación de GOY XPRESS en Quito.

## Funciones incluidas

### Cliente

- Dashboard con solicitudes, entregas, liquidaciones e inventario.
- Entrega programada: **$3,00 hasta 5 km**.
- Entrega Express: **$3,00 hasta 5 km + $0,50 por km adicional iniciado**.
- Mensajería ejecutiva para ingreso, retiro y entrega de documentos, depósitos,
  pagos y otras diligencias.
- Tarifa ejecutiva: **$6,50 hasta 40 minutos de espera + $0,10 por minuto
  adicional**.
- Retiro y despacho en la oficina: **$1,00**.
- Cálculo de valor del producto, envío y total a cobrar al destinatario.
- Cobro contra entrega sin comisión y control de liquidación.
- Registro de productos y ajuste de inventario.
- Solicitud del plan de bodega, empaque, entregas y apoyo comercial.
- Historial y seguimiento de estados.
- Aviso por WhatsApp al administrador `+593 99 772 9964` con mensaje
  prellenado.

### Administrador

- Bandeja de solicitudes nuevas, activas y finalizadas.
- Asignación de mensajero.
- Atención de prospectos del plan de bodega y ventas.
- Control de valores contra entrega.
- Confirmación de liquidaciones transferidas.

### Mensajero

- Selección de mensajero activo.
- Visualización de tareas asignadas.
- Llamada al cliente y apertura de la dirección en mapas.
- Estados `Asignado`, `En ruta` y `Finalizado`.
- Confirmación del valor a cobrar al finalizar.

## Persistencia

Las solicitudes y el inventario se guardan localmente con AsyncStorage. La
versión 3.0 también migra las solicitudes creadas por versiones anteriores.

## WhatsApp

La aplicación abre WhatsApp con una solicitud completa y prellenada. El usuario
debe pulsar **Enviar**. Para una notificación totalmente automática se requiere
WhatsApp Business Cloud API y un backend seguro; los tokens nunca deben guardarse
dentro de la aplicación móvil.

## Ejecutar y verificar

```bash
npm ci
npm test
npm run export:android
npx expo start
```

Escanea el código QR con Expo Go para probar la aplicación.

## Generar APK

El repositorio incluye `.github/workflows/build-apk.yml`. En GitHub abre
**Actions → Generar APK GOY XPRESS → Run workflow**. El APK aparecerá como
artefacto `GOY-XPRESS-APK` al terminar.

También puede compilarse con EAS después de vincular el proyecto Expo:

```bash
eas build:configure
eas build --platform android --profile preview
```

## Antes de producción

La versión actual es funcional en un solo dispositivo. Para operar con varios
clientes, administradores y mensajeros en tiempo real se debe añadir:

- autenticación por usuario;
- base de datos en la nube (Supabase o Firebase);
- notificaciones push;
- mapas y cálculo automático de distancia;
- evidencia fotográfica y firma del receptor;
- permisos separados para cada rol.
