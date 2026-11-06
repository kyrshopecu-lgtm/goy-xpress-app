# GOY XPRESS — Plan de reestructuración integrada

## Objetivo

Evolucionar el proyecto existente (no iniciar otro proyecto) hacia una plataforma empresarial centralizada. Mantener y reutilizar la web administrativa, API, base de datos y app de mensajero que ya existen. No eliminar datos ni desactivar aplicaciones en producción hasta completar migración y pruebas.

## Decisiones confirmadas

- No se necesita la app de clientes como canal operativo.
- No se necesita la página pública de servicios como parte de este flujo interno.
- Se conserva una web privada de administración como centro de control.
- El número principal de WhatsApp se utilizará para atención de clientes y también para consultas comerciales.
- Administración clasifica contactos como cliente, prospecto, empresa aliada u oportunidad comercial y puede derivarlos al número independiente de ventas.
- Se crean paneles diferenciados para administración, ventas y contabilidad, conectados a la misma API y base de datos.
- Cada trabajador accede con usuario y contraseña propios; el administrador configura permisos por módulo y acción.
- La app del mensajero se conserva y sincroniza con órdenes, estados y evidencias; las asignaciones también deben notificarse por WhatsApp cuando esté configurado el proveedor oficial.
- Se construirá una biblioteca editable de requisitos, pasos, costes, tiempos estimados y tiempos reales de trámites.

## Arquitectura funcional

1. **Administración central**: usuarios, permisos, contactos, bandeja de entrada, solicitudes, catálogo de servicios, trámites, asignación de mensajeros, configuración y auditoría.
2. **CRM / bandeja de WhatsApp**: conversaciones, datos del contacto, clasificación, consentimiento y preferencias de comunicación, notas internas, responsable y seguimiento.
3. **Ventas**: prospectos, empresas, oportunidades, etapas del embudo, tareas, próximas acciones, propuestas y resultados. La derivación registra origen, fecha, responsable y estado.
4. **Contabilidad**: ingresos, gastos, cobros, pagos, liquidaciones, comprobantes y reportes autorizados. Los registros financieros se vinculan con órdenes y ventas para evitar duplicación.
5. **Mensajeros**: órdenes asignadas, instrucciones, aceptación, inicio, novedades, fotografías/comprobantes, entrega y cierre.
6. **Biblioteca de trámites**: categorías, requisitos, documentos, pasos ordenados, entidad/fuente, fecha de revisión, tiempos por paso, costes internos/externos, incidencias y evidencias.
7. **Integraciones**: WhatsApp Business Platform/webhooks, notificaciones, API existente, PostgreSQL/Neon y despliegue actual en Vercel/Cloudflare según la auditoría.

## Seguridad y permisos

- RBAC por usuario, rol, módulo y acción: ver, crear, editar, asignar, aprobar, exportar y eliminar.
- Denegar por defecto; validar permisos en el servidor para cada endpoint y recurso, no solo ocultar elementos en la interfaz.
- Administrador general con control total; permisos de ventas, contabilidad y operaciones limitados por defecto.
- Separar credenciales por usuario; contraseña almacenada con hash seguro mediante el proveedor de autenticación elegido; sesiones con caducidad, revocación y recuperación segura.
- No enviar contraseñas por WhatsApp ni guardarlas en texto plano.
- Registrar auditoría de cambios sensibles: actor, acción, objeto y fecha/hora.
- Limitar datos personales y documentos visibles según necesidad operativa.
- Contabilidad debe tener permisos explícitos para exportaciones, ajustes y aprobación de pagos.
- La app del mensajero solo debe devolver las órdenes y los datos que el mensajero tenga asignados.

## Modelo de datos objetivo (a adaptar al esquema actual)

- users, roles, permissions, user_role_permissions, audit_log
- contacts, contact_channels, contact_tags, conversations, messages, consent_records
- sales_leads, opportunities, sales_activities, follow_up_tasks
- service_requests, service_catalog, courier_assignments, request_events, evidence_files
- procedure_templates, procedure_steps, procedure_requirements, procedure_runs, procedure_step_events
- financial_entries, payments, receipts, settlements
- integration_settings y delivery_events

No crear tablas duplicadas si el esquema existente ya cubre la misma entidad. Primero revisar el modelo actual y escribir migraciones compatibles.

## Flujo principal

1. El cliente o prospecto escribe al WhatsApp principal.
2. La integración oficial recibe el webhook y registra/relaciona el contacto y la conversación.
3. Administración clasifica el contacto y crea una solicitud operativa o una oportunidad comercial.
4. Si es venta, la acción “Derivar a ventas” registra la transferencia y notifica el número de ventas configurado.
5. Si es un servicio, se revisan requisitos y se crea una orden.
6. Administración asigna un mensajero; la app y WhatsApp del mensajero reciben la asignación.
7. El mensajero reporta estados y evidencia; el administrador verifica el cierre.
8. Los cobros, gastos y liquidaciones se vinculan a la orden y aparecen en contabilidad según permisos.
9. Los tiempos reales actualizan estadísticas del procedimiento, pero no cambian automáticamente requisitos oficiales sin revisión humana.

## Biblioteca inicial de trámites

Preparar fichas editables para:
- Ingreso y retiro de documentos en instituciones públicas.
- Matriculación y revisión vehicular.
- Apostillas y documentos.
- Depósitos y trámites bancarios.
- Verificación de repuestos.
- Cambio de dinero para negocios.
- Mensajería ejecutiva y trámites programados.
- Retiro y entrega de paquetes.

Los requisitos oficiales deben incluir fuente y fecha de verificación. Los tiempos se etiquetan como estimación interna o plazo oficial y nunca se presentan como garantía si no existe fuente confirmada.

## Plan de implementación sin interrupción

### Fase 0 — Auditoría (obligatoria)
- Revisar rutas actuales, autenticación, API, esquema PostgreSQL, webhooks, despliegues y pruebas.
- Identificar qué ramas/PRs pendientes contienen trabajo útil de CRM/WhatsApp y mensajero.
- Confirmar variables de entorno sin mostrar ni copiar secretos.
- Crear respaldo y pruebas de restauración antes de migraciones.

### Fase 1 — Acceso y permisos
- Añadir usuarios internos, roles y permisos granulares.
- Mantener la cuenta de administrador existente y ofrecer migración segura.
- Pruebas de acceso autorizado/denegado por endpoint.

### Fase 2 — CRM y derivación de ventas
- Unificar contactos y conversaciones.
- Clasificación editable y embudo comercial.
- Derivación auditable al número de ventas.
- Integración WhatsApp en modo prueba hasta que las credenciales oficiales estén verificadas.

### Fase 3 — Operaciones y mensajero
- Reutilizar órdenes, asignaciones, estados, evidencias y notificaciones existentes.
- Verificar el flujo completo de punta a punta.

### Fase 4 — Contabilidad
- Registros financieros vinculados a órdenes/ventas, permisos de aprobación y auditoría.
- Reportes con controles de exportación.

### Fase 5 — Biblioteca de trámites
- CRUD de plantillas, requisitos, pasos, tiempos y fuentes.
- Medición de tiempo real y revisión de incidencias.

### Fase 6 — Retirada de interfaces que ya no se necesitan
- Quitar la app de clientes y la web pública del flujo de producción solo después de confirmar que no son dependencias de administración, API, enlaces de registro o despliegue.
- Mantener historial y datos; desactivar antes de borrar.

## Criterios de aceptación

- El administrador puede crear, bloquear y modificar usuarios y permisos.
- Un usuario sin permiso no puede leer ni modificar datos mediante llamadas directas a la API.
- Ventas y contabilidad tienen vistas separadas y comparten los registros autorizados con administración.
- Una conversación puede clasificarse y derivarse al número comercial con trazabilidad.
- Una orden asignada llega al mensajero y registra aceptación, estados y evidencia.
- Los cobros y gastos se vinculan a la orden sin duplicación.
- Una ficha de trámite se puede editar sin cambiar código y muestra fuente/fecha y tiempos estimados.
- Las pruebas existentes pasan y hay pruebas de regresión para cada fase.
- No se eliminan datos ni se despliega una migración destructiva sin respaldo y validación.

## Estado actual

Este documento es la especificación de trabajo en una rama separada. No implica que las funciones nuevas ya estén implementadas ni desplegadas. La implementación debe continuar tras auditar los archivos y las integraciones existentes.
