-- GOY XPRESS v3.2.0
-- Seguridad por rol, invitaciones de un solo uso, perfiles, solicitudes e inventario.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.app_role as enum ('admin', 'client', 'courier');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  full_name text not null,
  whatsapp text,
  address text,
  contact_phone text,
  document_type text check (document_type in ('cedula', 'ruc')),
  document_number text,
  email text,
  avatar_path text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invited_profile_fields check (
    role = 'admin'
    or (
      whatsapp is not null
      and address is not null
      and contact_phone is not null
      and document_type is not null
      and document_number is not null
      and email is not null
    )
  )
);

create unique index if not exists profiles_document_unique
  on public.profiles (document_type, document_number)
  where document_number is not null;
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;
create index if not exists profiles_role_status_idx
  on public.profiles (role, status);

create table if not exists public.admin_accounts (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint admin_username_format check (username = lower(username) and username ~ '^[a-z0-9._-]{3,40}$')
);

create unique index if not exists admin_accounts_username_unique
  on public.admin_accounts (lower(username));
create unique index if not exists admin_accounts_single_admin
  on public.admin_accounts ((true));

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  role public.app_role not null check (role in ('client', 'courier')),
  label text,
  created_by uuid not null references public.admin_accounts(user_id),
  expires_at timestamptz not null,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_use_consistency check (
    (used_by is null and used_at is null) or (used_by is not null and used_at is not null)
  )
);

create index if not exists invitations_created_at_idx
  on public.invitations (created_at desc);
create index if not exists invitations_expiry_idx
  on public.invitations (expires_at)
  where used_at is null and revoked_at is null;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('shipment', 'procedure', 'office_pickup', 'partner')),
  status text not null default 'Pendiente'
    check (status in ('Pendiente', 'Asignado', 'En ruta', 'Finalizado', 'Cancelado')),
  client_id uuid not null references public.profiles(user_id),
  courier_id uuid references public.profiles(user_id),
  payload jsonb not null default '{}'::jsonb,
  service_cost numeric(12,2) not null default 0 check (service_cost >= 0),
  total_to_collect numeric(12,2) not null default 0 check (total_to_collect >= 0),
  settled boolean not null default false,
  settled_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_client_idx
  on public.service_requests (client_id, created_at desc);
create index if not exists service_requests_courier_idx
  on public.service_requests (courier_id, status, created_at desc);
create index if not exists service_requests_status_idx
  on public.service_requests (status, created_at desc);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  sku text not null,
  quantity integer not null default 0 check (quantity >= 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, sku)
);

create index if not exists inventory_items_client_idx
  on public.inventory_items (client_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_accounts a
    join public.profiles p on p.user_id = a.user_id
    where a.user_id = p_user_id
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

alter table public.profiles enable row level security;
alter table public.admin_accounts enable row level security;
alter table public.invitations enable row level security;
alter table public.service_requests enable row level security;
alter table public.inventory_items enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists admin_accounts_select_self on public.admin_accounts;
create policy admin_accounts_select_self
on public.admin_accounts for select
to authenticated
using (user_id = auth.uid() and public.is_admin());

drop policy if exists invitations_admin_select on public.invitations;
create policy invitations_admin_select
on public.invitations for select
to authenticated
using (public.is_admin());

drop policy if exists requests_role_select on public.service_requests;
create policy requests_role_select
on public.service_requests for select
to authenticated
using (
  public.is_admin()
  or client_id = auth.uid()
  or courier_id = auth.uid()
);

drop policy if exists inventory_owner_select on public.inventory_items;
create policy inventory_owner_select
on public.inventory_items for select
to authenticated
using (client_id = auth.uid() or public.is_admin());

drop policy if exists inventory_owner_insert on public.inventory_items;
create policy inventory_owner_insert
on public.inventory_items for insert
to authenticated
with check (
  client_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'client' and p.status = 'active'
  )
);

drop policy if exists inventory_owner_update on public.inventory_items;
create policy inventory_owner_update
on public.inventory_items for update
to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

drop policy if exists inventory_owner_delete on public.inventory_items;
create policy inventory_owner_delete
on public.inventory_items for delete
to authenticated
using (client_id = auth.uid());

create or replace function public.create_invitation(
  p_role public.app_role,
  p_label text default null,
  p_expires_hours integer default 72
)
returns table (
  id uuid,
  token text,
  role public.app_role,
  label text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_invitation public.invitations%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_role not in ('client', 'courier') then
    raise exception 'invalid_invitation_role';
  end if;
  if p_expires_hours < 1 or p_expires_hours > 720 then
    raise exception 'invalid_expiration';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.invitations (
    token_hash, role, label, created_by, expires_at
  ) values (
    encode(digest(v_token, 'sha256'), 'hex'),
    p_role,
    nullif(left(trim(coalesce(p_label, '')), 120), ''),
    auth.uid(),
    now() + make_interval(hours => p_expires_hours)
  ) returning * into v_invitation;

  return query
  select v_invitation.id, v_token, v_invitation.role,
         v_invitation.label, v_invitation.expires_at;
end;
$$;

create or replace function public.resolve_invitation(p_token text)
returns table (
  valid boolean,
  reason text,
  role public.app_role,
  label text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.invitations%rowtype;
begin
  select i.* into v_invitation
  from public.invitations i
  where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if not found then
    return query select false, 'invitation_invalid'::text, null::public.app_role, null::text, null::timestamptz;
  elsif v_invitation.revoked_at is not null then
    return query select false, 'invitation_revoked'::text, v_invitation.role, v_invitation.label, v_invitation.expires_at;
  elsif v_invitation.used_at is not null then
    return query select false, 'invitation_used'::text, v_invitation.role, v_invitation.label, v_invitation.expires_at;
  elsif v_invitation.expires_at <= now() then
    return query select false, 'invitation_expired'::text, v_invitation.role, v_invitation.label, v_invitation.expires_at;
  else
    return query select true, null::text, v_invitation.role, v_invitation.label, v_invitation.expires_at;
  end if;
end;
$$;

create or replace function public.complete_invited_registration(
  p_token text,
  p_full_name text,
  p_address text,
  p_whatsapp text,
  p_contact_phone text,
  p_document_type text,
  p_document_number text,
  p_email text
)
returns setof public.profiles
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_invitation public.invitations%rowtype;
  v_auth_email text;
  v_auth_phone text;
  v_document_number text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select i.* into v_invitation
  from public.invitations i
  where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found then raise exception 'invitation_invalid'; end if;
  if v_invitation.revoked_at is not null then raise exception 'invitation_revoked'; end if;
  if v_invitation.used_at is not null then raise exception 'invitation_used'; end if;
  if v_invitation.expires_at <= now() then raise exception 'invitation_expired'; end if;

  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'invalid_full_name'; end if;
  if length(trim(coalesce(p_address, ''))) < 8 then raise exception 'invalid_address'; end if;
  if coalesce(p_whatsapp, '') !~ '^\\+[1-9][0-9]{9,14}$' then raise exception 'invalid_whatsapp'; end if;
  if coalesce(p_contact_phone, '') !~ '^\\+[1-9][0-9]{9,14}$' then raise exception 'invalid_contact_phone'; end if;
  if lower(p_document_type) not in ('cedula', 'ruc') then raise exception 'invalid_document_type'; end if;
  v_document_number := regexp_replace(coalesce(p_document_number, ''), '[^0-9]', '', 'g');
  if (lower(p_document_type) = 'cedula' and length(v_document_number) <> 10)
     or (lower(p_document_type) = 'ruc' and length(v_document_number) <> 13) then
    raise exception 'invalid_document_number';
  end if;
  if lower(trim(coalesce(p_email, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' then
    raise exception 'invalid_email';
  end if;

  select lower(u.email), u.phone into v_auth_email, v_auth_phone
  from auth.users u where u.id = auth.uid();
  if coalesce(v_auth_email, '') <> lower(trim(p_email))
     and coalesce(v_auth_phone, '') <> p_whatsapp then
    raise exception 'verified_identity_mismatch';
  end if;

  insert into public.profiles (
    user_id, role, full_name, whatsapp, address, contact_phone,
    document_type, document_number, email, status
  ) values (
    auth.uid(), v_invitation.role, trim(p_full_name), p_whatsapp,
    trim(p_address), p_contact_phone, lower(p_document_type),
    v_document_number, lower(trim(p_email)), 'active'
  );

  update public.invitations
  set used_by = auth.uid(), used_at = now()
  where invitations.id = v_invitation.id;

  return query select p.* from public.profiles p where p.user_id = auth.uid();
end;
$$;

create or replace function public.set_profile_avatar(p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_avatar_path not like auth.uid()::text || '/%' then raise exception 'invalid_avatar_path'; end if;
  update public.profiles set avatar_path = p_avatar_path where user_id = auth.uid();
  if not found then raise exception 'profile_required'; end if;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  update public.invitations
  set revoked_at = now()
  where id = p_invitation_id and used_at is null and revoked_at is null;
end;
$$;

create or replace function public.create_service_request(p_request jsonb)
returns setof public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_row public.service_requests%rowtype;
begin
  select * into v_profile from public.profiles where user_id = auth.uid();
  if not found or v_profile.role <> 'client' or v_profile.status <> 'active' then
    raise exception 'client_required';
  end if;
  if coalesce(p_request->>'code', '') !~ '^[A-Z]{3}-[0-9-]{6,20}$' then
    raise exception 'invalid_request_code';
  end if;
  if coalesce(p_request->>'kind', '') not in ('shipment', 'procedure', 'office_pickup', 'partner') then
    raise exception 'invalid_request_kind';
  end if;

  insert into public.service_requests (
    code, kind, status, client_id, payload, service_cost,
    total_to_collect, settled
  ) values (
    p_request->>'code',
    p_request->>'kind',
    'Pendiente',
    auth.uid(),
    p_request - array['status', 'courier', 'courierId', 'settledAt', 'finishedAt'],
    greatest(0, coalesce((p_request->>'serviceCost')::numeric, 0)),
    greatest(0, coalesce((p_request->>'totalToCollect')::numeric, 0)),
    coalesce((p_request->>'settled')::boolean, false)
  ) returning * into v_row;

  return next v_row;
end;
$$;

create or replace function public.update_service_request(p_code text, p_patch jsonb)
returns setof public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.service_requests%rowtype;
  v_role public.app_role;
  v_new_status text;
  v_courier_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.user_id = auth.uid() and p.status = 'active';
  if not found then raise exception 'profile_required'; end if;

  select * into v_row from public.service_requests where code = p_code for update;
  if not found then raise exception 'request_not_found'; end if;

  if v_role = 'admin' and public.is_admin() then
    if (p_patch - array['status', 'courier_id', 'settled', 'settled_at', 'finished_at']) <> '{}'::jsonb then
      raise exception 'invalid_admin_patch';
    end if;

    v_new_status := coalesce(p_patch->>'status', v_row.status);
    if v_new_status not in ('Pendiente', 'Asignado', 'En ruta', 'Finalizado', 'Cancelado') then
      raise exception 'invalid_request_status';
    end if;

    if p_patch ? 'courier_id' then
      v_courier_id := nullif(p_patch->>'courier_id', '')::uuid;
      if v_courier_id is not null and not exists (
        select 1 from public.profiles p
        where p.user_id = v_courier_id and p.role = 'courier' and p.status = 'active'
      ) then
        raise exception 'invalid_courier';
      end if;
    else
      v_courier_id := v_row.courier_id;
    end if;

    update public.service_requests r set
      status = v_new_status,
      courier_id = v_courier_id,
      settled = case when p_patch ? 'settled' then (p_patch->>'settled')::boolean else r.settled end,
      settled_at = case when p_patch ? 'settled_at' then (p_patch->>'settled_at')::timestamptz else r.settled_at end,
      finished_at = case
        when p_patch ? 'finished_at' then (p_patch->>'finished_at')::timestamptz
        when v_new_status = 'Finalizado' and r.finished_at is null then now()
        else r.finished_at
      end
    where r.id = v_row.id
    returning * into v_row;
  elsif v_role = 'courier' and v_row.courier_id = auth.uid() then
    if (p_patch - array['status', 'finished_at']) <> '{}'::jsonb then
      raise exception 'invalid_courier_patch';
    end if;
    v_new_status := p_patch->>'status';
    if not (
      (v_row.status = 'Asignado' and v_new_status = 'En ruta')
      or (v_row.status = 'En ruta' and v_new_status = 'Finalizado')
    ) then
      raise exception 'invalid_status_transition';
    end if;
    update public.service_requests r set
      status = v_new_status,
      finished_at = case when v_new_status = 'Finalizado' then now() else r.finished_at end
    where r.id = v_row.id
    returning * into v_row;
  else
    raise exception 'request_update_denied';
  end if;

  return next v_row;
end;
$$;

create or replace function public.adjust_inventory_quantity(p_item_id uuid, p_amount integer)
returns setof public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inventory_items%rowtype;
begin
  update public.inventory_items
  set quantity = greatest(0, quantity + p_amount)
  where id = p_item_id and client_id = auth.uid()
  returning * into v_row;
  if not found then raise exception 'inventory_item_not_found'; end if;
  return next v_row;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select_owner_or_admin on storage.objects;
create policy avatars_select_owner_or_admin
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists avatars_insert_owner on storage.objects;
create policy avatars_insert_owner
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_update_owner on storage.objects;
create policy avatars_update_owner
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_owner on storage.objects;
create policy avatars_delete_owner
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  alter publication supabase_realtime add table public.service_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_items;
exception
  when duplicate_object then null;
end $$;

revoke all on public.admin_accounts from anon, authenticated;
grant select on public.profiles, public.invitations, public.service_requests, public.inventory_items to authenticated;
grant insert, update, delete on public.inventory_items to authenticated;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.create_invitation(public.app_role, text, integer) from public;
revoke all on function public.resolve_invitation(text) from public;
revoke all on function public.complete_invited_registration(text, text, text, text, text, text, text, text) from public;
revoke all on function public.set_profile_avatar(text) from public;
revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.create_service_request(jsonb) from public;
revoke all on function public.update_service_request(text, jsonb) from public;
revoke all on function public.adjust_inventory_quantity(uuid, integer) from public;

grant execute on function public.resolve_invitation(text) to anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.create_invitation(public.app_role, text, integer) to authenticated;
grant execute on function public.complete_invited_registration(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_profile_avatar(text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.create_service_request(jsonb) to authenticated;
grant execute on function public.update_service_request(text, jsonb) to authenticated;
grant execute on function public.adjust_inventory_quantity(uuid, integer) to authenticated;

-- IMPORTANTE: el único administrador se crea manualmente después de ejecutar
-- esta migración. Consulta supabase/SETUP.md. El índice
-- admin_accounts_single_admin impide registrar un segundo administrador.
