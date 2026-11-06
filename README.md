# GOY XPRESS · Administración web y app de mensajero

GOY XPRESS opera con dos herramientas principales:

1. **Web de administración:** centro único para registrar clientes, crear y recibir órdenes, cotizar, asignar mensajeros, actualizar estados, controlar cobros, revisar evidencias, consultar GPS y generar reportes.
2. **App de mensajero:** aplicación móvil para que cada mensajero ingrese con sus credenciales, consulte únicamente las órdenes asignadas, navegue a las direcciones, actualice el avance y cargue fotografías y comprobantes.

## Flujo operativo

1. El administrador registra o selecciona al cliente desde la web.
2. El administrador crea la orden en el panel, registra servicio, direcciones, instrucciones y valores.
3. Desde la web asigna la orden al mensajero correspondiente.
4. El mensajero recibe y ejecuta la orden desde su app: recogida, ruta, novedades, cobro y entrega.
5. La web centraliza el estado, las evidencias, la ubicación y el control administrativo de la operación.

**No se desarrollará ni se generará una APK independiente para clientes.** Los clientes no necesitan instalar una aplicación: las órdenes se ingresan y administran desde la web de administración. La app móvil se reserva para el personal mensajero.

## Funciones de la web de administración

- Crear, consultar, editar, asignar y dar seguimiento a órdenes.
- Administrar clientes y mensajeros.
- Gestionar servicios, cotizaciones, agenda y trámites.
- Controlar cobros, valores contra entrega y liquidaciones.
- Consultar evidencias fotográficas, novedades y ubicación del mensajero.
- Gestionar usuarios internos y permisos por módulo (administración, ventas y contabilidad).

## Funciones de la app de mensajero

- Inicio de sesión individual y acceso según permisos.
- Consulta de órdenes asignadas.
- Datos de recogida, entrega, contacto e instrucciones.
- Navegación y seguimiento GPS durante una operación activa.
- Actualización de estados de la orden.
- Fotografías de recogida, entrega y evidencias de trámites o depósitos.
- Registro de novedades y confirmación de valores recaudados.

## Tarifas operativas configuradas

- Entrega programada: **$3,00 hasta 5 km**.
- Entrega Express: **$3,00 hasta 5 km + $0,50 por km adicional iniciado**.
- Mensajería ejecutiva: **$6,50 hasta 40 minutos + $0,10 por minuto adicional**.
- Retiro y despacho en oficina: **$1,00**.

## Persistencia e integraciones

La operación debe centralizarse en el backend y la base de datos compartida para que la web y la app de mensajero consulten la misma orden y sus actualizaciones. Las notificaciones automáticas de WhatsApp requieren credenciales y configuración de WhatsApp Business Cloud API; no se consideran activas solo por tener enlaces o mensajes prellenados.

## Ejecutar y verificar

```bash
npm ci
npm test
```

La compilación Android se realiza con el perfil de mensajero:

```bash
cp app.courier.json app.json
cp index.courier.js index.js
npm run export:android
CI=1 npx expo prebuild --platform android --clean
```

El workflow **Generar APK GOY XPRESS Mensajero** genera y verifica la APK del mensajero, incluida la variante ARM64, y ejecuta una prueba de apertura en Android 10.

## Seguridad y producción

- No guardar credenciales privadas dentro de la APK.
- El servidor valida identidad, permisos y asignación de cada orden.
- Un mensajero solo puede consultar y actualizar las órdenes que le corresponden.
- No desplegar cambios a producción ni activar servicios de pago sin autorización.
