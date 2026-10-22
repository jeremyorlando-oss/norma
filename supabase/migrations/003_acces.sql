-- NORMA — accès : sessions tablette par code, comptes Direction, RLS.
-- Principe : aucune écriture directe dans les tables. Les applications appellent des fonctions (RPC)
-- qui vérifient la session et les droits. Lecture limitée à sa propre entreprise.
set search_path = norma, public;

-- Émulation locale de Supabase (sans effet sur Supabase où ces objets existent déjà)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  end if;
end $$;

-- Comptes : un compte Supabase = un membre (Direction / Employé) ou une tablette de stand
alter table member add column auth_user_id uuid unique;
create table device (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  auth_user_id uuid unique not null,
  active boolean not null default true
);

create or replace function my_company() returns uuid language sql stable security definer as $$
  select company_id from member where auth_user_id = auth.uid() and active
  union all select company_id from device where auth_user_id = auth.uid() and active
  limit 1;
$$;

-- ---------------------------------------------------------------- sessions tablette (D35)
create table stand_session (
  token uuid primary key default gen_random_uuid(),
  device_id uuid not null references device(id),
  member_id uuid not null references member(id),
  last_seen timestamptz not null default now()
);

-- Code saisi : vérifie le code, pointe l'arrivée si besoin, ouvre une session de 2 min (prolongée à chaque action)
create or replace function rpc_ouvrir_session(p_pin text)
returns table(token uuid, member_id uuid, prenom text, poste text, arrivee boolean, droits right_code[], langue text)
language plpgsql security definer as $$
declare d device; m uuid; t uuid; arr boolean;
begin
  select * into d from device where auth_user_id = auth.uid() and active;
  if d.id is null then raise exception 'Appareil non autorisé'; end if;
  m := login_pin(d.company_id, d.id::text, p_pin);
  if m is null then raise exception 'Code incorrect'; end if;
  arr := open_session(m) = 'arrivee';
  insert into stand_session(device_id, member_id) values (d.id, m) returning stand_session.token into t;
  return query
    select t, mb.id, mb.first_name, p.name, arr,
           case when p.is_owner then enum_range(null::right_code) else array(select distinct unnest(p.rights || mb.extra_rights)) end,
           mb.lang
    from member mb join poste p on p.id = mb.poste_id where mb.id = m;
end $$;

-- Résout le membre d'une session valide (2 min d'inactivité max)
create or replace function session_member(p_token uuid) returns uuid language plpgsql security definer as $$
declare s stand_session;
begin
  select * into s from stand_session where token = p_token;
  if s.token is null or s.last_seen < now() - interval '2 minutes' then raise exception 'Session expirée : retapez votre code'; end if;
  if not exists (select 1 from device where id = s.device_id and auth_user_id = auth.uid()) then raise exception 'Session d''un autre appareil'; end if;
  update stand_session set last_seen = now() where token = p_token;
  return s.member_id;
end $$;

create or replace function rpc_fermer_session(p_token uuid) returns void language sql security definer as $$
  delete from stand_session where token = p_token;
$$;

create or replace function rpc_depointer(p_token uuid) returns void language plpgsql security definer as $$
declare m uuid := session_member(p_token);
begin
  perform depointer(m);
  delete from stand_session where token = p_token;
end $$;

-- ---------------------------------------------------------------- actions (tablette ou iPhone Direction)
-- Acteur = membre de la session tablette, ou membre connecté sur son iPhone (saisie de dépannage)
create or replace function actor(p_token uuid) returns table(member_id uuid, company_id uuid, source text)
language plpgsql security definer as $$
begin
  if p_token is not null then
    return query select m.id, m.company_id, 'stand'::text from member m where m.id = session_member(p_token);
  else
    return query select m.id, m.company_id,
      case when p.is_owner then 'iphone_gerant' else 'iphone_manager' end
      from member m join poste p on p.id = m.poste_id
      where m.auth_user_id = auth.uid() and m.active and (p.is_owner or 'gestion_equipe' = any(p.rights));
  end if;
  if not found then raise exception 'Accès refusé'; end if;
end $$;

create or replace function rpc_prise_de_poste(p_token uuid, p_apte boolean, p_tenue boolean, p_bijoux boolean, p_mains boolean)
returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  insert into shift_check(company_id, member_id, apte, tenue_ok, bijoux_ok, mains_ok)
  values (a.company_id, a.member_id, p_apte, p_tenue, p_bijoux, p_mains);
end $$;

create or replace function rpc_releve(p_token uuid, p_equipment uuid, p_value numeric, p_measured_at timestamptz)
returns table(id uuid, status text) language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  if not exists (select 1 from equipment e where e.id = p_equipment and e.company_id = a.company_id) then raise exception 'Équipement inconnu'; end if;
  return query insert into temperature_reading(company_id, equipment_id, member_id, value, measured_at, source_device)
    values (a.company_id, p_equipment, a.member_id, p_value, p_measured_at, a.source)
    returning temperature_reading.id, temperature_reading.status;
end $$;

create or replace function rpc_nettoyage(p_token uuid, p_item uuid, p_product text, p_anomaly text default null)
returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  if not exists (select 1 from cleaning_item i where i.id = p_item and i.company_id = a.company_id and i.active) then raise exception 'Tâche inconnue'; end if;
  insert into cleaning_done(item_id, member_id, product_used, anomaly) values (p_item, a.member_id, p_product, p_anomaly);
end $$;

-- ---------------------------------------------------------------- RLS : lecture de sa propre entreprise, aucune écriture directe
do $$
declare t text;
begin
  foreach t in array array['company','poste','member','equipment','official_limit','temperature_reading','nonconformity',
    'nc_step','event','time_entry','shift_check','cleaning_item','cleaning_done','oil_check','product_catalog',
    'reception','recipe','prep_lot','lot_disposal','device','stand_session','pin_attempt','audit_log'] loop
    execute format('alter table norma.%I enable row level security', t);
    execute format('revoke all on norma.%I from authenticated', t);
  end loop;
end $$;

grant usage on schema norma to authenticated;
grant select on official_limit, poste, equipment, temperature_reading, nonconformity, nc_step, event,
  cleaning_item, cleaning_done, oil_check, product_catalog, reception, recipe, prep_lot, lot_disposal to authenticated;
grant select (id, company_id, poste_id, first_name, last_name, lang, active) on member to authenticated;

create policy lecture_limites on official_limit for select to authenticated using (true);
do $$
declare t text;
begin
  foreach t in array array['poste','member','equipment','temperature_reading','nonconformity','event',
    'cleaning_item','oil_check','product_catalog','reception','recipe','prep_lot'] loop
    execute format('create policy lecture_entreprise on norma.%I for select to authenticated using (company_id = norma.my_company())', t);
  end loop;
end $$;
create policy lecture_entreprise on nc_step for select to authenticated
  using (exists (select 1 from nonconformity n where n.id = nc_id and n.company_id = my_company()));
create policy lecture_entreprise on cleaning_done for select to authenticated
  using (exists (select 1 from cleaning_item i where i.id = item_id and i.company_id = my_company()));
create policy lecture_entreprise on lot_disposal for select to authenticated
  using (exists (select 1 from prep_lot l where l.id = lot_id and l.company_id = my_company()));
-- Heures : seulement Gérant/Manager (heures_equipe) ou ses propres heures
grant select on time_entry to authenticated;
create or replace function my_member() returns uuid language sql stable security definer as $$
  select id from member where auth_user_id = auth.uid() and active;
$$;
create policy heures on time_entry for select to authenticated using (
  company_id = my_company() and (member_id = my_member() or has_right(my_member(), 'heures_equipe')));

revoke execute on all functions in schema norma from public;
grant execute on function rpc_ouvrir_session(text), rpc_fermer_session(uuid), rpc_depointer(uuid),
  rpc_prise_de_poste(uuid, boolean, boolean, boolean, boolean), rpc_releve(uuid, uuid, numeric, timestamptz),
  rpc_nettoyage(uuid, uuid, text, text), my_company(), my_member() to authenticated;
-- fonctions appelées par les politiques
alter function has_right(uuid, right_code) security definer;
grant execute on function has_right(uuid, right_code) to authenticated;

-- Sécurité : chemin de recherche figé pour toutes les fonctions à privilèges (évite le détournement de fonctions)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.prosecdef loop
    execute format('alter function %s set search_path = norma, public', f.sig);
  end loop;
end $$;
