# GOY XPRESS — Hallazgos iniciales de auditoría

Fecha de revisión: 2026-10-28

## Repositorio revisado

- Repositorio: `kyrshopecu-lgtm/goy-xpress-app`
- Rama base: `main`
- Último commit visible en la rama base durante esta revisión: `61358a10e9bdf82d9fde7f7d23a1d92d7ff69196` (30-09-2026).
- Web administrativa: carpeta `admin-web/`, servida mediante el despliegue existente.
- API: `api/[...path].js`, que encadena `server/server-v6.js`, `server/admin-management.js`, `server/admin-clients.js` y `server/courier-profile.js`.
- Persistencia: estado JSONB en PostgreSQL/Neon mediante `goy_state` cuando `DATABASE_URL` está configurada; algunos modos locales usan archivo.
- Aplicación: React Native/Expo; el repositorio aún contiene componentes y configuración para Cliente y Mensajero.

## Funcionalidad que ya existe y debe reutilizarse

- Inicio de sesión administrativo mediante variables de entorno `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `TOKEN_SECRET`.
- Usuarios de tipo cliente y mensajero con hash PBKDF2, sesiones firmadas y aprobación administrativa.
- Órdenes, asignaciones, estados, pagos/liquidaciones, invitaciones, agenda y evidencias en distintos módulos.
- Módulo de prospectos con clasificación de servicios, seguimiento y funciones comerciales.
- Configuración para WhatsApp Business Cloud API y plantillas; los mensajes automáticos dependen de credenciales, plantillas y configuración de producción.
- Interfaz de permisos/seguridad en `admin-web/role-security.js`, que actualmente contiene principalmente herramientas de administración de mensajeros; no equivale todavía a un sistema completo de permisos por módulo.
- Tests de API, administración, prospectos, estados y notificaciones en `server/` y `src/`.

## Riesgos y brechas que deben resolverse

1. **Roles internos incompletos**: el inicio de sesión de la web administrativa utiliza una cuenta de administrador de entorno; la autenticación de la API ya contempla cliente/mensajero, pero no un ciclo completo de usuarios internos de ventas y contabilidad con permisos granulares.
2. **Autorización del servidor**: las rutas administrativas existentes validan rol administrador. Hay que introducir permisos explícitos y probar cada endpoint antes de habilitar acceso a ventas o contabilidad.
3. **Panel demo frente a panel conectado**: `admin-web/README.md` advierte que una versión de la carpeta es prototipo/demo; `ADMIN_DEPLOY.md` describe un panel y API desplegables. Se debe confirmar el contenido y la configuración del dominio de producción antes de tocar despliegues.
4. **Estado de integración WhatsApp**: hay adaptadores y variables de entorno, pero el funcionamiento real depende de credenciales Meta, webhook, número de origen, plantillas aprobadas y número destino de ventas. No se debe asumir que el envío está activo solo porque existe el código.
5. **Persistencia JSONB**: la tabla `goy_state` guarda muchas entidades en un único documento JSONB. Antes de añadir módulos hay que diseñar escrituras compatibles y evitar actualizaciones concurrentes que sobrescriban datos.
6. **Aplicación de clientes**: sigue existiendo código, configuración y posiblemente flujos de registro para clientes. No borrarlo en esta fase; primero identificar qué endpoints o procesos administrativos dependen de ellos.
7. **Cambios pendientes**: el repositorio muestra pull requests abiertos relacionados con WhatsApp, IA comercial y mensajero. Revisar su estado y contenido antes de duplicar o descartar trabajo.

## Próximos pasos técnicos recomendados

1. Confirmar los despliegues y las variables de entorno requeridas sin revelar valores secretos.
2. Auditar las rutas de login, estado de sesión y todas las rutas administrativas; crear una tabla de rutas y permisos.
3. Implementar usuarios internos con invitación/activación, contraseña segura, bloqueo y revocación de sesiones.
4. Añadir autorización por permiso en servidor y tests de acceso denegado.
5. Separar vistas de administración, ventas y contabilidad usando la misma API y base de datos.
6. Unificar la clasificación de contactos y derivación de prospectos con trazabilidad al número de ventas.
7. Añadir el catálogo de procedimientos con requisitos, fuente, fecha de revisión, pasos y tiempos estimados/reales.
8. Ejecutar la suite existente y pruebas de integración antes de desplegar a producción.

## Restricciones de seguridad para el trabajo

- No editar secretos ni agregarlos a Git.
- No publicar credenciales de prueba.
- No eliminar tablas, datos, aplicaciones ni endpoints en esta fase.
- No desplegar ni fusionar cambios de autenticación sin pruebas de regresión.
- Mantener los módulos nuevos desactivados hasta que los secretos y webhooks estén configurados y validados.
