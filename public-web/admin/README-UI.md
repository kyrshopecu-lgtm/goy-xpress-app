# Panel administrativo GOY XPRESS

Rediseño visual v2 del centro de control.

- Mantiene los IDs y scripts funcionales existentes.
- Añade `pro-dashboard.css` como capa visual, sin reemplazar la lógica de `app.js`.
- Incluye diseño responsive para escritorio, tablet y móvil.
- Los indicadores del resumen conservan navegación hacia solicitudes y cobros.
- `ui-smoke-test.js` valida en navegador que los nodos principales requeridos por la lógica sigan presentes.

Antes de producción: validar login, carga de `/admin/data`, creación de orden, cambio de estado, invitación y exportación de reporte en el entorno desplegado.
