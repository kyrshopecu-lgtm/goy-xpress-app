# GOY XPRESS Admin Web

Panel web privado para administrar la operación de GOY XPRESS.

## Incluye

- Inicio de sesión de administrador.
- Dashboard operativo.
- Clientes y búsqueda.
- Solicitudes de entrega y trámites.
- Mensajeros.
- Cobros.
- Creación de enlaces de invitación.
- Reporte CSV.
- Diseño adaptable a computadora, tablet y celular.

## Estado actual

La carpeta funciona como prototipo navegable en modo `demo`. La APK actual no tiene un backend compartido visible en el repositorio, por lo que los datos mostrados son de demostración.

**No publicar el modo demo como panel de producción.** Las credenciales que aparecen en `config.js` son únicamente para validar la interfaz y no representan una cuenta administrativa real.

## Conexión segura recomendada

1. Crear un backend/API común para la APK y el panel web.
2. Guardar usuarios, clientes, pedidos, trámites, mensajeros y cobros en una base de datos central.
3. Implementar autenticación real y rol `admin` en el servidor.
4. Cambiar `config.js` a `mode: 'api'` y definir `apiBaseUrl`.
5. El endpoint `POST /admin/login` debe devolver un token de sesión y el servidor debe validar el rol del usuario en cada acción administrativa.
6. Nunca guardar contraseñas reales, claves SMTP, secretos o tokens privados en este repositorio ni en JavaScript del navegador.

## Vista local

Abrir `admin-web/index.html` en un navegador. Para desarrollo es preferible servir la carpeta con un servidor HTTP local.

## Próxima integración

Cuando se defina el backend compartido, reemplazar los datos demo de `app.js` por llamadas a API para que cualquier solicitud creada desde la APK aparezca automáticamente en este panel.
