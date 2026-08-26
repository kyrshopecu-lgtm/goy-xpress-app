# GOY XPRESS — Panel administrador

## Estado

El panel, formulario de registro y API están preparados para Vercel.

Rutas previstas:

- `/admin` — panel privado del administrador.
- `/api/health` — verificación del servidor.
- `/api/admin/login` — inicio de sesión administrativo.
- `/api/admin/data` — clientes, solicitudes, mensajeros y cobros.
- `/api/admin/invites` — creación de invitaciones.
- `/api/requests` — recepción de solicitudes de la APK.
- `/registro/<token>` — registro seguro del cliente invitado.

## Variables privadas requeridas en Vercel

Configurar para Production y Preview, sin escribir sus valores en GitHub:

- `ADMIN_EMAIL` — correo exclusivo del administrador.
- `ADMIN_PASSWORD` — contraseña administrativa robusta.
- `TOKEN_SECRET` — secreto aleatorio largo para firmar sesiones.
- `DATABASE_URL` — conexión PostgreSQL de Neon.
- `ALLOWED_ORIGIN` — dominio web permitido; en producción usar el dominio final.

## Base de datos

La API usa `@neondatabase/serverless`. Al existir `DATABASE_URL`, crea automáticamente una tabla `goy_state` y guarda allí clientes, solicitudes, mensajeros, cobros e invitaciones. Sin `DATABASE_URL` solo existe el modo local de desarrollo y no debe usarse para producción serverless.

## Seguridad

- Nunca guardar contraseñas, SMTP keys, tokens o `DATABASE_URL` en archivos del repositorio.
- El panel guarda únicamente el token de sesión en `sessionStorage`.
- Las sesiones administrativas vencen automáticamente.
- Los endpoints administrativos requieren `Authorization: Bearer <token>`.
- Las invitaciones vencen y son de un solo uso.

## Comprobación de producción

1. Abrir `/api/health` y confirmar `ok: true` y `storage: postgres`.
2. Abrir `/admin` e iniciar sesión con la cuenta privada.
3. Crear una invitación desde el panel.
4. Abrir `/registro/<token>` y registrar un cliente de prueba.
5. Confirmar que el cliente aparece en el panel.
6. Crear una solicitud desde la APK y comprobar que aparece en Solicitudes.
7. Asignar mensajero y cambiar estado para validar el flujo completo.

## Nota

No promover a producción hasta que `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `TOKEN_SECRET` estén configurados en Vercel.
