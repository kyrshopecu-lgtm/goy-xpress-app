# GOY IA Comercial — activación

## Incluido
- Motor comercial y clasificación de servicios.
- CRM: prospectos, mensajes, campañas y reuniones.
- Consentimiento, baja y bloqueo de seguimiento.
- Adaptador oficial WhatsApp Business Cloud API.
- Componente visual del pipeline para panel administrativo.
- Pruebas automatizadas de CRM y WhatsApp.

## Variables privadas requeridas en Vercel
Nunca guardar valores reales en GitHub.

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_GRAPH_VERSION=v25.0`
- `WHATSAPP_OTP_TEMPLATE` (ya usado por OTP si aplica)
- `WHATSAPP_OTP_TEMPLATE_LANG=es`

## Meta / WhatsApp
1. Usar una cuenta oficial de WhatsApp Business Platform.
2. Registrar el webhook HTTPS del proyecto y configurar `WHATSAPP_VERIFY_TOKEN`.
3. Suscribir el campo `messages`.
4. Para contactos iniciados por la empresa usar plantillas aprobadas y consentimiento válido.
5. Respetar bajas y lista de supresión del CRM.

## Agenda
La agenda comercial usa Google Calendar como proveedor externo. El backend conserva `calendarEventId`, enlace de Meet y horario en el CRM. La creación real del evento se realiza mediante la conexión autorizada de Google Calendar.

## Criterio de producción
No activar campañas masivas hasta verificar: credenciales Meta, webhook, plantilla aprobada, consentimiento de la base, número remitente, prueba de envío/recepción y baja real.