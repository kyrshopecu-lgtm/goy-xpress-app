# GOY XPRESS Mobile 3.2

Aplicación móvil en React Native y Expo para la operación de GOY XPRESS en Quito.

La versión 3.2 incorpora autenticación real, un único administrador, registro por
invitación y separación de datos por rol mediante Supabase Row Level Security.

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
- Registro privado mediante enlace de un solo uso.
- Acceso con código OTP por WhatsApp o correo.
- Perfil con cédula/RUC, datos de contacto y fotografía privada.
- Aviso por WhatsApp al administrador `+593 99 772 9964` con mensaje
  prellenado.

### Administrador

- Bandeja de solicitudes nuevas, activas y finalizadas.
- Asignación de mensajero.
- Atención de prospectos del plan de bodega y ventas.
- Control de valores contra entrega.
- Confirmación de liquidaciones transferidas.
- Inicio mediante usuario y contraseña, sin selector público de rol.
- Creación y revocación de enlaces personalizados para clientes y mensajeros.
- La base de datos impide registrar un segundo administrador.

### Mensajero

- Visualización de tareas asignadas.
- Llamada al cliente y apertura de la dirección en mapas.
- Estados `Asignado`, `En ruta` y `Finalizado`.
- Confirmación del valor a cobrar al finalizar.

## Seguridad y persistencia

Las sesiones se conservan en el dispositivo y los perfiles, invitaciones,
solicitudes e inventario se almacenan en Supabase. Las políticas RLS permiten:

- al cliente consultar únicamente sus solicitudes e inventario;
- al mensajero consultar únicamente las tareas que le fueron asignadas;
- al único administrador gestionar la operación completa;
- mantener las fotografías en un bucket privado por usuario.

El esquema y las políticas están en
`supabase/migrations/202608250001_secure_access.sql`.

## WhatsApp

El acceso por WhatsApp utiliza Supabase Auth con Twilio como proveedor. El
remitente de WhatsApp Business y las credenciales privadas se configuran en los
paneles de Twilio y Supabase; nunca se guardan en GitHub ni en la APK.

Consulta `supabase/SETUP.md` para activar el proyecto, crear el único
administrador y realizar las pruebas de punta a punta.

## Ejecutar y verificar

```bash
npm ci
npm test
npm run export:android
npx expo start
```

Escanea el código QR con Expo Go para probar la aplicación.

## Generar APK

El repositorio incluye `.github/workflows/build-apk.yml`. Primero configura las
variables públicas descritas en `.env.example`. En GitHub abre
**Actions → Generar APK GOY XPRESS → Run workflow**. El APK aparecerá como
artefacto `GOY-XPRESS-v3.2.1-INSTALABLE` al terminar.

También puede compilarse con EAS después de vincular el proyecto Expo:

```bash
eas build:configure
eas build --platform android --profile preview
```

## Antes de distribuir

No distribuyas una APK compilada sin las variables de Supabase: mostrará
“Activación pendiente”. Después de conectar Supabase y Twilio, ejecuta el ciclo
completo de pruebas descrito en `supabase/SETUP.md` antes de entregar el archivo.
