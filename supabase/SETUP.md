# Activación segura de GOY XPRESS v3.2.2

La APK no contiene contraseñas, tokens de Twilio ni la llave `service_role`.
Todos los permisos se validan en Supabase mediante Row Level Security (RLS).

## 1. Crear el proyecto

1. Crea un proyecto de Supabase.
2. Ejecuta `supabase/migrations/202608250001_secure_access.sql` en el SQL Editor.
3. En Authentication > URL Configuration agrega `goyxpress://**` a las URL permitidas.
4. En la plantilla de correo de acceso reemplaza el enlace por el código `{{ .Token }}`.

## 2. Configurar el único administrador

En Authentication > Users crea manualmente una cuenta confirmada con:

- Correo interno: `TU_USUARIO@admin.goyxpress.app`
- Contraseña: una contraseña larga que solo conozca el propietario.

No es necesario que el correo interno exista: funciona como identificador privado.
Después copia el UUID del usuario y ejecuta, reemplazando los valores:

```sql
begin;

insert into public.profiles (
  user_id, role, full_name, email, status
) values (
  'UUID_DEL_USUARIO',
  'admin',
  'Administrador GOY XPRESS',
  'TU_USUARIO@admin.goyxpress.app',
  'active'
);

insert into public.admin_accounts (user_id, username)
values ('UUID_DEL_USUARIO', 'tu_usuario');

commit;
```

La base tiene un índice de unicidad que solo permite una fila en
`admin_accounts`; por eso no se puede crear un segundo administrador desde la
APK ni desde un enlace.

## 3. Activar WhatsApp OTP

1. Crea o conecta una cuenta de Twilio.
2. Registra el remitente de WhatsApp Business con la marca y el número de GOY XPRESS.
3. En Supabase > Authentication > Providers > Phone selecciona Twilio.
4. Guarda el Account SID, Auth Token y Messaging Service SID únicamente en el panel de Supabase.
5. Activa Phone Signups y prueba primero con un número autorizado por Twilio.

Las credenciales privadas de Twilio nunca se agregan a GitHub ni a la APK.

## 4. Variables públicas de compilación

Configura estos secretos/variables en GitHub Actions o en un archivo `.env`
local que no se suba al repositorio:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_LLAVE_PUBLICA
EXPO_PUBLIC_INVITE_BASE_URL=goyxpress://register
EXPO_PUBLIC_ADMIN_LOGIN_DOMAIN=admin.goyxpress.app
```

La URL y la llave publicable de Supabase pueden estar en la aplicación porque
RLS limita cada operación. No agregues `service_role` ni el Auth Token de
Twilio como variables `EXPO_PUBLIC_*`.

## 5. Pruebas obligatorias antes de distribuir

1. Iniciar como administrador con usuario y contraseña.
2. Crear una invitación para cliente y otra para mensajero.
3. Confirmar que cada enlace funcione una sola vez y venza a las 72 horas.
4. Registrar ambos perfiles con foto.
5. Probar OTP por correo y WhatsApp.
6. Crear una solicitud desde el cliente, asignarla desde administrador y
   finalizarla desde el mensajero.
7. Verificar que cada rol no pueda consultar datos de otro usuario.
