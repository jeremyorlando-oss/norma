-- NORMA — socle V1 : entreprises, postes/droits, membres (PIN), équipements, relevés,
-- non-conformités, journal d'audit. Registres en AJOUT SEUL (aucune modification/suppression).
-- Compatible PostgreSQL 15+ (Supabase). Les politiques RLS Supabase sont dans 002.

create extension if not exists pgcrypto;
create schema if not exists norma;
set search_path = norma, public;

-- ---------------------------------------------------------------- référentiel
create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_secret bytea not null default gen_random_bytes(32),   -- clé HMAC des PIN (jamais exposée)
  yellow_margin numeric(4,1) not null default 0.5 check (yellow_margin between 0 and 5),
  created_at timestamptz not null default now()
);

-- Droits disponibles (D20-D29)
create type right_code as enum (
  'pointage','prise_poste','nettoyage','signaler_nc','allergenes_lecture',
  'releves','reception','preparations','jeter_lot','traiter_nc','cloturer_nc',
  'tableau_bord','heures_equipe','export','equipements','gestion_equipe',
  'admin_documents','reglages_gerant');

create table poste (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  rights right_code[] not null default '{}',
  is_owner boolean not null default false,          -- Gérant : tous les droits, non limitable
  unique (company_id, name)
);

create table member (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  poste_id uuid not null references poste(id),
  first_name text not null,
  last_name text not null,
  lang text not null default 'fr' check (lang in ('fr','es','en')),
  extra_rights right_code[] not null default '{}',   -- options par personne (aide de cuisine)
  pin_hmac bytea,                                     -- HMAC(PIN) : unicité vérifiable sans stocker le PIN
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index member_pin_unique on member(company_id, pin_hmac) where pin_hmac is not null and active;

create type equipment_type as enum ('froid_positif','froid_negatif','cuisson','maintien_chaud','friteuse');

-- Limites officielles connues (source vérifiée phase 2) : un seuil interne ne peut pas être moins strict.
create table official_limit (
  type equipment_type primary key,
  min_value numeric(5,1),
  max_value numeric(5,1),
  source text not null
);
insert into official_limit values
  ('froid_positif', 0, 5, 'Directive OFCO VD manifestations 08.04.2019 : 0 à 5 °C max'),
  ('froid_negatif', null, -18, 'Directive OFCO VD manifestations 08.04.2019 : -18 °C au minimum'),
  ('maintien_chaud', 65, null, 'Directive OFCO VD manifestations 08.04.2019 : mets chauds min. +65 °C'),
  ('cuisson', null, null, 'Aucune valeur officielle trouvée : règle interne'),
  ('friteuse', null, 175, 'Fiche Laboratoire cantonal SO, mars 2025 (recommandation) : 175 °C max');

create table equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  type equipment_type not null,
  min_value numeric(5,1),
  max_value numeric(5,1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (min_value is not null or max_value is not null),
  check (min_value is null or max_value is null or min_value < max_value)
);

create or replace function check_threshold_not_weaker() returns trigger language plpgsql as $$
declare l official_limit;
begin
  select * into l from official_limit where type = new.type;
  if l.max_value is not null and (new.max_value is null or new.max_value > l.max_value) then
    raise exception 'Seuil maximum % moins strict que la limite officielle % (%)', new.max_value, l.max_value, l.source;
  end if;
  if l.min_value is not null and new.type <> 'froid_positif' and (new.min_value is null or new.min_value < l.min_value) then
    raise exception 'Seuil minimum % moins strict que la limite officielle % (%)', new.min_value, l.min_value, l.source;
  end if;
  return new;
end $$;
create trigger equipment_threshold before insert or update on equipment
  for each row execute function check_threshold_not_weaker();

-- ---------------------------------------------------------------- droits
create or replace function has_right(p_member uuid, p_right right_code) returns boolean
language sql stable as $$
  select coalesce(bool_or(p.is_owner or p_right = any(p.rights) or p_right = any(m.extra_rights)), false)
  from member m join poste p on p.id = m.poste_id
  where m.id = p_member and m.active;
$$;

-- ---------------------------------------------------------------- PIN (D19)
create or replace function pin_hmac(p_company uuid, p_pin text) returns bytea
language sql stable security definer as $$
  select hmac(convert_to(p_pin,'UTF8'), c.pin_secret, 'sha256') from company c where c.id = p_company;
$$;

create or replace function set_member_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer as $$
begin
  if p_pin !~ '^\d{4}$' then raise exception 'Le code doit contenir 4 chiffres'; end if;
  if p_pin ~ '^(\d)\1{3}$' or position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0 then
    raise exception 'Code trop facile à deviner';
  end if;
  update member set pin_hmac = pin_hmac(company_id, p_pin) where id = p_member;
exception when unique_violation then
  raise exception 'Code déjà attribué à un autre membre';
end $$;

create table pin_attempt (
  id bigserial primary key,
  company_id uuid not null references company(id),
  device text not null,
  success boolean not null,
  at timestamptz not null default now()
);

-- Retourne le membre si le code est bon ; bloque 1 min après 5 échecs consécutifs sur l'appareil.
create or replace function login_pin(p_company uuid, p_device text, p_pin text) returns uuid
language plpgsql security definer as $$
declare fails int; m uuid;
begin
  select count(*) into fails from (
    select success from pin_attempt where company_id = p_company and device = p_device
      and at > now() - interval '1 minute' order by at desc limit 5) t where not success;
  if fails >= 5 then raise exception 'Trop de codes faux : réessayez dans 1 minute'; end if;
  select id into m from member where company_id = p_company and active and pin_hmac = pin_hmac(p_company, p_pin);
  insert into pin_attempt(company_id, device, success) values (p_company, p_device, m is not null);
  return m;   -- null = code faux
end $$;

-- ---------------------------------------------------------------- registres en ajout seul
create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Registre non modifiable : ajoutez une correction (table %)', tg_table_name;
end $$;

create table temperature_reading (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  equipment_id uuid not null references equipment(id),
  member_id uuid not null references member(id),
  value numeric(5,1) not null check (value between -50 and 300),
  min_applied numeric(5,1),            -- seuils copiés au moment du relevé (preuve historique)
  max_applied numeric(5,1),
  status text,                         -- calculé par le serveur : vert / jaune / rouge
  source_device text not null default 'stand' check (source_device in ('stand','iphone_gerant','iphone_manager')),
  measured_at timestamptz not null,    -- heure de l'appareil
  received_at timestamptz not null default now(),  -- heure du serveur
  corrects_id uuid references temperature_reading(id),
  correction_reason text,
  check ((corrects_id is null) = (correction_reason is null))
);
create trigger temperature_reading_no_update before update or delete on temperature_reading
  for each row execute function forbid_change();

create table nonconformity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  kind text not null check (kind in ('temperature','huile','reception','corps_etranger','coupure_courant','hygiene','autre')),
  description text not null,
  opened_by uuid not null references member(id),
  opened_at timestamptz not null default now(),
  reading_id uuid references temperature_reading(id)
);
create trigger nonconformity_no_update before update or delete on nonconformity
  for each row execute function forbid_change();

create table nc_step (
  id bigserial primary key,
  nc_id uuid not null references nonconformity(id),
  step text not null check (step in ('mesure_immediate','evaluation_risque','action_corrective','verification','cloture')),
  content text not null,
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger nc_step_no_update before update or delete on nc_step
  for each row execute function forbid_change();

-- Statut calculé côté serveur (le client ne peut pas déclarer un relevé « conforme »)
create or replace function reading_status(v numeric, mn numeric, mx numeric, margin numeric) returns text
language sql immutable as $$
  select case
    when (mn is not null and v < mn) or (mx is not null and v > mx) then 'rouge'
    when (mn is not null and v < mn + margin) or (mx is not null and v > mx - margin) then 'jaune'
    else 'vert' end;
$$;

create or replace function temperature_reading_before() returns trigger language plpgsql as $$
declare e equipment; c company;
begin
  if not has_right(new.member_id, 'releves') then
    raise exception 'Ce poste n''a pas le droit de saisir des relevés';
  end if;
  select * into e from equipment where id = new.equipment_id;
  if not e.active then raise exception 'Équipement retiré'; end if;
  select * into c from company where id = new.company_id;
  new.min_applied := e.min_value; new.max_applied := e.max_value;
  new.status := reading_status(new.value, e.min_value, e.max_value, c.yellow_margin);
  return new;
end $$;
create trigger temperature_reading_compute before insert on temperature_reading
  for each row execute function temperature_reading_before();

-- Un relevé rouge ouvre automatiquement une non-conformité (D-M2)
create or replace function temperature_reading_after() returns trigger language plpgsql as $$
begin
  if new.status = 'rouge' then
    insert into nonconformity(company_id, kind, description, opened_by, reading_id)
    select new.company_id, 'temperature',
           e.name || ' : ' || new.value || ' °C hors seuil', new.member_id, new.id
    from equipment e where e.id = new.equipment_id;
  end if;
  return new;
end $$;
create trigger temperature_reading_nc after insert on temperature_reading
  for each row execute function temperature_reading_after();

-- Clôture : droit requis + action corrective et vérification préalables
create or replace function nc_step_before() returns trigger language plpgsql as $$
begin
  if new.step = 'cloture' then
    if not has_right(new.member_id, 'cloturer_nc') then raise exception 'Clôture non autorisée pour ce poste'; end if;
    if not exists (select 1 from nc_step where nc_id = new.nc_id and step = 'action_corrective')
       or not exists (select 1 from nc_step where nc_id = new.nc_id and step = 'verification') then
      raise exception 'Clôture impossible : action corrective et vérification requises';
    end if;
    if exists (select 1 from nc_step where nc_id = new.nc_id and step = 'cloture') then
      raise exception 'Non-conformité déjà clôturée';
    end if;
  elsif new.step in ('action_corrective','evaluation_risque','verification') and not has_right(new.member_id, 'traiter_nc') then
    raise exception 'Traitement non autorisé pour ce poste';
  end if;
  return new;
end $$;
create trigger nc_step_rules before insert on nc_step for each row execute function nc_step_before();

-- ---------------------------------------------------------------- journal d'audit
create table audit_log (
  id bigserial primary key,
  table_name text not null,
  op text not null,
  row_data jsonb not null,
  at timestamptz not null default now()
);
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function forbid_change();

create or replace function audit() returns trigger language plpgsql as $$
begin
  insert into audit_log(table_name, op, row_data)
  values (tg_table_name, tg_op, to_jsonb(coalesce(new, old)) - 'pin_hmac' - 'pin_secret');
  return coalesce(new, old);
end $$;
create trigger audit_member after insert or update on member for each row execute function audit();
create trigger audit_poste after insert or update on poste for each row execute function audit();
create trigger audit_equipment after insert or update on equipment for each row execute function audit();
