# GOY XPRESS — Paneles de operación

## Accesos
- Administración: `/admin`
- Ventas: `/ventas`
- Contabilidad: `/contabilidad`
- Portal de equipo genérico: `/equipo`

Los accesos de Ventas y Contabilidad utilizan `POST /api/auth/login` con rol y usuario interno. Las cuentas se crean y sus permisos se administran desde **Equipo y permisos** en el panel administrativo. El servidor valida permisos en cada ruta; ocultar botones no sustituye la autorización del servidor.

## Administración
Gestiona solicitudes, clientes, mensajeros, prospectos, servicios, cuentas internas, permisos y auditoría.

## Ventas
Permite registrar prospectos, revisar el estado comercial, aprobar un mensaje y solicitar su envío por WhatsApp. El envío usa un canal independiente de Ventas y requiere configurar en el servidor `GOY_WA_SALES_ACCESS_TOKEN`, `GOY_WA_SALES_PHONE_NUMBER_ID` y `GOY_WA_SALES_PROSPECT_TEMPLATE` (opcionalmente `GOY_WA_SALES_MEDIA_HEADER=true` y `GOY_WA_SALES_TEMPLATE_LANG=es`). No reutiliza el número de atención al cliente. La cuenta también necesita el permiso `sales.whatsapp.send`.

El webhook firmado de Meta está disponible en `/api/webhooks/whatsapp/prospects`. Los mensajes de números conocidos se guardan en el historial del cliente; los números desconocidos se incorporan a la cola de prospectos de Ventas. Los mensajes de exclusión (`STOP`, `SALIR`, etc.) bloquean futuros contactos.

## Contabilidad
Permite registrar ingresos y egresos, consultar totales, editar movimientos pendientes y conciliar movimientos. Los registros conciliados quedan bloqueados para edición.

## Seguridad y datos
- Contraseñas procesadas en servidor con PBKDF2.
- Tokens de sesión Bearer; nunca se exponen hashes o salts al navegador.
- Permisos explícitos por usuario y rol; un administrador puede limitar el acceso.
- Los datos se mantienen en el almacenamiento central configurado por el servidor (Neon cuando existe `DATABASE_URL`, o el almacén local configurado).
- No se eliminan datos históricos al habilitar los nuevos paneles.

## Desarrollo y validación
Ejecutar `npm test`. El workflow `Validar panel administrativo` verifica pruebas y sintaxis de los módulos web y API.
