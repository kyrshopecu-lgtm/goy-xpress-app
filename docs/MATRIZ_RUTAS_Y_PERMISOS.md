# GOY XPRESS — Matriz inicial de módulos y permisos

Fecha: 2026-10-28  
Estado: diseño de transición; todavía no activa permisos nuevos.

## Roles objetivo

| Módulo/acción | Administrador | Ventas | Contabilidad | Mensajero |
|---|---|---|---|---|
| Configuración global, usuarios y permisos | Completo | Sin acceso | Sin acceso | Sin acceso |
| CRM: consultar y clasificar contactos | Completo | Consultar/editar | Solo lectura de datos necesarios para facturación | Sin acceso |
| Prospectos y oportunidades | Completo | Crear/editar/seguimiento | Sin acceso por defecto | Sin acceso |
| Envío comercial por WhatsApp | Completo | Solo con permiso explícito y consentimiento registrado | Sin acceso | Sin acceso |
| Órdenes y asignaciones | Completo | Lectura limitada si se autoriza | Lectura para conciliación | Solo órdenes asignadas |
| Estados, fotos y evidencias de entrega | Completo | Lectura limitada | Lectura de evidencia necesaria para cobros | Crear/actualizar en órdenes asignadas |
| Ingresos, gastos, cobros y pagos | Completo | Sin acceso a datos financieros detallados | Completo en el módulo contable | Solo liquidaciones propias necesarias |
| Catálogo de trámites y requisitos | Completo | Consultar; proponer cambios si se autoriza | Consultar costos aprobados | Consultar pasos necesarios para la orden |
| Auditoría de acciones | Completo | Solo sus propias acciones, si se habilita | Solo sus propias acciones, si se habilita | Solo sus propias acciones, si se habilita |

## Convenciones de autorización

Los nombres siguientes son claves propuestas para los permisos de servidor, no endpoints ya implementados:

- users.read, users.create, users.update, users.block, roles.manage
- crm.contacts.read, crm.contacts.update, crm.contacts.assign
- sales.prospects.read, sales.prospects.create, sales.prospects.update, sales.whatsapp.send
- operations.requests.read, operations.requests.assign, operations.evidence.read
- courier.jobs.read_assigned, courier.jobs.update_assigned, courier.evidence.upload
- accounting.read, accounting.entries.create, accounting.entries.update, accounting.reconcile, accounting.reports
- procedures.read, procedures.create, procedures.update, audit.read

## Reglas obligatorias

1. **Denegar por defecto.** Un usuario interno solo puede ejecutar una acción si el servidor comprueba el permiso correspondiente.
2. **No confiar en el cliente.** Ocultar botones no sustituye autorización en la API.
3. **Separación de funciones.** Ventas no recibe permisos contables ni administración de usuarios por defecto; contabilidad no recibe envío comercial ni asignación operativa.
4. **Alcance de mensajero.** Las acciones deben limitarse a órdenes asignadas al usuario autenticado; no basta con comprobar que el rol sea courier.
5. **Administrador existente.** Conservar el flujo actual de administrador hasta que las pruebas de migración estén completas.
6. **Sesiones.** Bloquear a un usuario debe impedir que siga usando una sesión anterior; comprobar el estado actual del usuario en el servidor o revocar sesiones.
7. **Auditoría.** Guardar actor, acción, entidad, identificador, fecha y resultado; nunca contraseñas, tokens ni secretos.
8. **WhatsApp.** Separar permiso de enviar mensajes de permiso para consultar prospectos. Respetar consentimiento, exclusión voluntaria y plantillas aprobadas.
9. **Finanzas.** Los cambios de saldos o conciliaciones deben tener validación, trazabilidad e idempotencia; no inferir montos a partir de texto libre.
10. **Pruebas.** Cada endpoint protegido debe tener casos de éxito, no autenticado, rol equivocado, permiso ausente, usuario bloqueado y recurso fuera del alcance del usuario.

## Secuencia de implementación

1. Identificar todos los puntos donde la API verifica el rol admin y las rutas de mensajero que verifican asignación.
2. Añadir un módulo de autorización común y pruebas unitarias de permisos.
3. Añadir almacenamiento de usuarios internos y sesión con expiración, sin modificar usuarios cliente/mensajero.
4. Migrar rutas de una en una, comenzando por CRM/ventas; mantener administrador como superusuario explícito.
5. Construir vistas de panel basadas en permisos de servidor, no en rol declarado por el navegador.
6. Incorporar auditoría y pruebas de regresión antes de habilitar roles en producción.
7. Probar WhatsApp y variables en el entorno de staging; no exponer secretos ni activar envíos automáticos hasta confirmar la configuración.

## Criterio para retirar Cliente y web pública

No retirar la app Cliente ni la web pública hasta demostrar que los procesos de registro, creación/seguimiento de solicitudes, notificaciones y consulta de servicios ya tienen un reemplazo funcional y que administración/mensajeros no dependen de rutas o recursos que se van a retirar.
