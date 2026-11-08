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
Permite registrar prospectos, revisar el estado comercial, aprobar un mensaje y solicitar su envío por WhatsApp. El envío depende de que las credenciales y plantilla de WhatsApp estén configuradas en el servidor y de que la cuenta tenga el permiso correspondiente.

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
