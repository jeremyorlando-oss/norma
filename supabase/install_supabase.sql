-- NORMA · installation complète de la base (migrations 001 à 004), à coller dans Supabase › SQL Editor › Run.
-- Généré à partir de supabase/migrations/. Ne pas modifier à la main.

-- ===== 001_socle.sql =====
-- NORMA — socle V1 : entreprises, postes/droits, membres (PIN), équipements, relevés,
-- non-conformités, journal d'audit. Registres en AJOUT SEUL (aucune modification/suppression).
-- Compatible PostgreSQL 15+ (Supabase). Les politiques RLS Supabase sont dans 002.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists norma;
set search_path = norma, public, extensions;

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

-- ===== 002_operations.sql =====
-- NORMA — opérations du stand : événements, pointage, prise de poste, nettoyage,
-- huile, réception, recettes et lots de préparation. Toujours en AJOUT SEUL.
set search_path = norma, public, extensions;

create table event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date)
);

-- ---------------------------------------------------------------- pointage (D19)
create table time_entry (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  kind text not null check (kind in ('arrivee','depart')),
  at timestamptz not null default now(),
  source_device text not null default 'stand',
  corrects_id uuid references time_entry(id),
  corrected_by uuid references member(id),
  correction_reason text,
  check ((corrects_id is null) = (correction_reason is null))
);
create trigger time_entry_no_update before update or delete on time_entry for each row execute function forbid_change();

create or replace function time_entry_before() returns trigger language plpgsql as $$
declare last_kind text;
begin
  if new.corrects_id is not null then
    if new.corrected_by is null or not has_right(new.corrected_by, 'heures_equipe') then
      raise exception 'Correction d''heures réservée au Gérant et au Manager';
    end if;
    return new;
  end if;
  select kind into last_kind from time_entry
   where member_id = new.member_id and corrects_id is null order by at desc limit 1;
  if new.kind = coalesce(last_kind, 'depart') then
    raise exception 'Pointage incohérent : % déjà enregistré', new.kind;
  end if;
  return new;
end $$;
create trigger time_entry_rules before insert on time_entry for each row execute function time_entry_before();

-- Code saisi sur la tablette : ouvre la session de la personne.
-- Si elle n'est pas encore pointée → arrivée automatique. Sinon → simple ouverture de session.
-- Le DÉPART n'est JAMAIS automatique : uniquement via depointer() (bouton dédié + confirmation).
create or replace function is_clocked_in(p_member uuid) returns boolean language sql stable as $$
  select coalesce((select kind = 'arrivee' from time_entry
    where member_id = p_member and corrects_id is null order by at desc limit 1), false);
$$;

create or replace function open_session(p_member uuid) returns text language plpgsql as $$
begin
  if is_clocked_in(p_member) then return 'session'; end if;
  insert into time_entry(company_id, member_id, kind) select company_id, p_member, 'arrivee' from member where id = p_member;
  return 'arrivee';
end $$;

create or replace function depointer(p_member uuid) returns void language plpgsql as $$
begin
  if not is_clocked_in(p_member) then raise exception 'Personne non pointée'; end if;
  insert into time_entry(company_id, member_id, kind) select company_id, p_member, 'depart' from member where id = p_member;
end $$;

-- ---------------------------------------------------------------- prise de poste (santé : apte / non apte seulement)
create table shift_check (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  apte boolean not null,                      -- aucune donnée de symptôme
  tenue_ok boolean not null,
  bijoux_ok boolean not null,
  mains_ok boolean not null,
  at timestamptz not null default now()
);
create trigger shift_check_no_update before update or delete on shift_check for each row execute function forbid_change();

create or replace function is_fit_today(p_member uuid) returns boolean language sql stable as $$
  select coalesce((select apte and tenue_ok and bijoux_ok and mains_ok from shift_check
    where member_id = p_member and at::date = current_date order by at desc limit 1), false);
$$;

-- Relevés : il faut aussi être apte aujourd'hui (complète la règle du socle)
create or replace function temperature_reading_before() returns trigger language plpgsql as $$
declare e equipment; c company;
begin
  if not has_right(new.member_id, 'releves') then raise exception 'Ce poste n''a pas le droit de saisir des relevés'; end if;
  if not is_fit_today(new.member_id) then raise exception 'Prise de poste non conforme ou non faite aujourd''hui'; end if;
  select * into e from equipment where id = new.equipment_id;
  if not e.active then raise exception 'Équipement retiré'; end if;
  select * into c from company where id = new.company_id;
  new.min_applied := e.min_value; new.max_applied := e.max_value;
  new.status := reading_status(new.value, e.min_value, e.max_value, c.yellow_margin);
  return new;
end $$;

-- ---------------------------------------------------------------- nettoyage
create table cleaning_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  kind text not null check (kind in ('zone','lieu','equipement')),
  equipment_id uuid references equipment(id),
  product text not null,
  frequency text not null check (frequency in ('intervalle','changement_tache','fin_service','fin_journee','quotidien')),
  interval_minutes int check (interval_minutes > 0),
  active boolean not null default true,
  check ((frequency = 'intervalle') = (interval_minutes is not null))
);

-- Un équipement ajouté crée sa tâche de nettoyage (D33)
create or replace function equipment_cleaning() returns trigger language plpgsql as $$
begin
  insert into cleaning_item(company_id, name, kind, equipment_id, product, frequency)
  values (new.company_id, new.name, 'equipement', new.id,
          case when new.type in ('cuisson','friteuse') then 'Dégraissant + désinfectant alimentaire' else 'Désinfectant alimentaire' end,
          case new.type when 'friteuse' then 'fin_journee' when 'cuisson' then 'fin_service' else 'quotidien' end);
  return new;
end $$;
create trigger equipment_cleaning_item after insert on equipment for each row execute function equipment_cleaning();

create table cleaning_done (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references cleaning_item(id),
  member_id uuid not null references member(id),
  product_used text not null,
  anomaly text,
  at timestamptz not null default now()
);
create trigger cleaning_done_no_update before update or delete on cleaning_done for each row execute function forbid_change();

create or replace function cleaning_done_before() returns trigger language plpgsql as $$
begin
  if not has_right(new.member_id, 'nettoyage') then raise exception 'Ce poste n''a pas le droit de valider un nettoyage'; end if;
  return new;
end $$;
create trigger cleaning_done_rules before insert on cleaning_done for each row execute function cleaning_done_before();

-- État des tâches à intervalle (D34) : jaune 15 min avant l'échéance, rouge après.
create or replace function cleaning_state(p_item uuid, p_now timestamptz default now(), p_start timestamptz default null)
returns table(due_at timestamptz, state text) language sql stable as $$
  select d, case when p_now > d then 'rouge' when p_now > d - interval '15 minutes' then 'jaune' else 'ok' end
  from (select coalesce((select max(at) from cleaning_done where item_id = i.id), p_start, p_now)
               + make_interval(mins => i.interval_minutes) as d
        from cleaning_item i where i.id = p_item and i.frequency = 'intervalle') t;
$$;

-- ---------------------------------------------------------------- huile (D28)
create table oil_check (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  equipment_id uuid not null references equipment(id),
  member_id uuid not null references member(id),
  moment text not null check (moment in ('matin','service','soir')),
  temperature numeric(5,1),
  polar_pct numeric(4,1) check (polar_pct between 0 and 60),
  defects text[] not null default '{}' check (defects <@ array['couleur','odeur','mousse','fumee']),
  filtered boolean not null default false,
  changed boolean not null default false,
  must_change boolean,
  at timestamptz not null default now(),
  check (moment <> 'soir' or polar_pct is not null),
  check (moment = 'soir' or temperature is not null)
);
create trigger oil_check_no_update before update or delete on oil_check for each row execute function forbid_change();

create or replace function oil_check_before() returns trigger language plpgsql as $$
declare e equipment;
begin
  if not has_right(new.member_id, 'releves') then raise exception 'Ce poste n''a pas le droit de contrôler l''huile'; end if;
  select * into e from equipment where id = new.equipment_id;
  if e.type <> 'friteuse' then raise exception 'Cet équipement n''est pas une friteuse'; end if;
  new.must_change := coalesce(new.polar_pct >= 25, false) or cardinality(new.defects) > 0;
  return new;
end $$;
create trigger oil_check_rules before insert on oil_check for each row execute function oil_check_before();

create or replace function oil_check_after() returns trigger language plpgsql as $$
declare e equipment;
begin
  select * into e from equipment where id = new.equipment_id;
  if (new.temperature is not null and new.temperature > e.max_value) or (new.must_change and not new.changed and new.moment <> 'soir') then
    insert into nonconformity(company_id, kind, description, opened_by)
    values (new.company_id, 'huile', e.name || ' : huile à changer ou température trop élevée', new.member_id);
  end if;
  return new;
end $$;
create trigger oil_check_nc after insert on oil_check for each row execute function oil_check_after();

-- ---------------------------------------------------------------- réception (D25, D26)
create table product_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  barcode text,
  name text not null,
  supplier text not null,
  unique (company_id, barcode)
);

create table reception (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  supplier text not null,
  product text not null,
  supplier_lot text not null,
  dlc date not null,
  temperature numeric(5,1) not null,
  packaging_ok boolean not null,
  aspect_ok boolean not null,
  order_ok boolean not null,
  cold_chain_ok boolean not null,
  accepted boolean not null,
  refusal_reason text,
  delivery_note_path text,           -- photo du bon (stockage)
  autofilled boolean not null default false,
  at timestamptz not null default now(),
  check (accepted or refusal_reason is not null)
);
create trigger reception_no_update before update or delete on reception for each row execute function forbid_change();

create or replace function reception_before() returns trigger language plpgsql as $$
begin
  if not has_right(new.member_id, 'reception') then raise exception 'Ce poste n''a pas le droit de réceptionner'; end if;
  if new.accepted and not (new.packaging_ok and new.aspect_ok and new.order_ok and new.cold_chain_ok) then
    raise exception 'Acceptation impossible : un contrôle est à NON';
  end if;
  if new.accepted and new.dlc < current_date then raise exception 'Acceptation impossible : DLC dépassée'; end if;
  return new;
end $$;
create trigger reception_rules before insert on reception for each row execute function reception_before();

create or replace function reception_after() returns trigger language plpgsql as $$
begin
  if not new.accepted then
    insert into nonconformity(company_id, kind, description, opened_by)
    values (new.company_id, 'reception', new.product || ' refusé : ' || new.refusal_reason, new.member_id);
  end if;
  return new;
end $$;
create trigger reception_nc after insert on reception for each row execute function reception_after();

-- ---------------------------------------------------------------- recettes et lots (D7, D17)
create table recipe (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  code text not null check (code ~ '^[A-Z]{3}$'),
  shelf_days int not null default 2 check (shelf_days between 0 and 30),
  allergens text[] not null default '{}' check (allergens <@ array['gluten','crustaces','oeufs','poisson','arachides','soja','lait','fruits_coque','celeri','moutarde','sesame','sulfites','lupin','mollusques']),
  active boolean not null default true,
  unique (company_id, code)
);
create trigger audit_recipe after insert or update on recipe for each row execute function audit();

create table prep_lot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  recipe_id uuid not null references recipe(id),
  member_id uuid not null references member(id),
  produced_on date not null default current_date,
  seq int,
  lot_code text,
  use_by date,
  at timestamptz not null default now(),
  unique (company_id, lot_code)
);
create trigger prep_lot_no_update before update or delete on prep_lot for each row execute function forbid_change();

create or replace function prep_lot_before() returns trigger language plpgsql as $$
declare r recipe;
begin
  if not has_right(new.member_id, 'preparations') then raise exception 'Ce poste n''a pas le droit de produire une préparation'; end if;
  if not is_fit_today(new.member_id) then raise exception 'Prise de poste non conforme ou non faite aujourd''hui'; end if;
  select * into r from recipe where id = new.recipe_id;
  perform pg_advisory_xact_lock(hashtext(new.recipe_id::text || new.produced_on));
  select coalesce(max(seq), 0) + 1 into new.seq from prep_lot where recipe_id = new.recipe_id and produced_on = new.produced_on;
  new.lot_code := r.code || '-' || to_char(new.produced_on, 'DDMMYY') || '-' || new.seq;   -- CODE-JJMMAA-n
  new.use_by := new.produced_on + r.shelf_days;                                              -- J+2, fin de journée
  return new;
end $$;
create trigger prep_lot_rules before insert on prep_lot for each row execute function prep_lot_before();

create table lot_disposal (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null unique references prep_lot(id),
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger lot_disposal_no_update before update or delete on lot_disposal for each row execute function forbid_change();

create or replace function lot_disposal_before() returns trigger language plpgsql as $$
begin
  if not has_right(new.member_id, 'jeter_lot') then raise exception 'Ce poste n''a pas le droit de jeter un lot'; end if;
  return new;
end $$;
create trigger lot_disposal_rules before insert on lot_disposal for each row execute function lot_disposal_before();

create or replace view lot_status as
  select l.*, r.name as recipe_name,
    case when d.id is not null then 'jete'
         when current_date > l.use_by then 'a_jeter'
         when current_date = l.use_by then 'aujourd_hui'
         else 'a_garder' end as status
  from prep_lot l join recipe r on r.id = l.recipe_id left join lot_disposal d on d.lot_id = l.id;

-- ===== 003_acces.sql =====
-- NORMA — accès : sessions tablette par code, comptes Direction, RLS.
-- Principe : aucune écriture directe dans les tables. Les applications appellent des fonctions (RPC)
-- qui vérifient la session et les droits. Lecture limitée à sa propre entreprise.
set search_path = norma, public, extensions;

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
    execute format('alter function %s set search_path = norma, public, extensions', f.sig);
  end loop;
end $$;

-- ===== 004_rpc_modules.sql =====
-- NORMA — fonctions d'action pour huile, réception, préparations, lots, non-conformités.
-- Même modèle que 003 : acteur vérifié (session tablette ou iPhone Direction), droits contrôlés par les déclencheurs.
set search_path = norma, public, extensions;

create or replace function own_row(p_company uuid, p_table regclass, p_id uuid) returns void language plpgsql security definer as $$
declare ok boolean;
begin
  execute format('select exists(select 1 from %s where id = $1 and company_id = $2)', p_table) into ok using p_id, p_company;
  if not ok then raise exception 'Élément inconnu'; end if;
end $$;

create or replace function rpc_huile(p_token uuid, p_equipment uuid, p_moment text, p_temperature numeric,
  p_polar numeric, p_defects text[], p_filtered boolean, p_changed boolean)
returns table(id uuid, must_change boolean) language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'equipment', p_equipment);
  return query insert into oil_check(company_id, equipment_id, member_id, moment, temperature, polar_pct, defects, filtered, changed)
    values (a.company_id, p_equipment, a.member_id, p_moment, p_temperature, p_polar, coalesce(p_defects, '{}'), p_filtered, p_changed)
    returning oil_check.id, oil_check.must_change;
end $$;

create or replace function rpc_reception(p_token uuid, p_supplier text, p_product text, p_lot text, p_dlc date,
  p_temperature numeric, p_packaging boolean, p_aspect boolean, p_order boolean, p_cold boolean,
  p_accepted boolean, p_refusal text, p_photo text, p_autofilled boolean, p_barcode text default null)
returns uuid language plpgsql security definer as $$
declare a record; rid uuid;
begin
  select * into a from actor(p_token);
  insert into reception(company_id, member_id, supplier, product, supplier_lot, dlc, temperature, packaging_ok, aspect_ok,
    order_ok, cold_chain_ok, accepted, refusal_reason, delivery_note_path, autofilled)
  values (a.company_id, a.member_id, p_supplier, p_product, p_lot, p_dlc, p_temperature, p_packaging, p_aspect,
    p_order, p_cold, p_accepted, p_refusal, p_photo, p_autofilled)
  returning id into rid;
  -- catalogue interne (D26) : le produit scanné est mémorisé
  if p_barcode is not null then
    insert into product_catalog(company_id, barcode, name, supplier) values (a.company_id, p_barcode, p_product, p_supplier)
    on conflict (company_id, barcode) do nothing;
  end if;
  return rid;
end $$;

create or replace function rpc_produit_scanne(p_token uuid, p_barcode text) returns table(name text, supplier text)
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  return query select c.name, c.supplier from product_catalog c where c.company_id = a.company_id and c.barcode = p_barcode;
end $$;

create or replace function rpc_preparation(p_token uuid, p_recipe uuid) returns table(lot_code text, use_by date)
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'recipe', p_recipe);
  return query insert into prep_lot(company_id, recipe_id, member_id) values (a.company_id, p_recipe, a.member_id)
    returning prep_lot.lot_code, prep_lot.use_by;
end $$;

create or replace function rpc_jeter_lot(p_token uuid, p_lot uuid) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'prep_lot', p_lot);
  insert into lot_disposal(lot_id, member_id) values (p_lot, a.member_id);
end $$;

create or replace function rpc_signaler(p_token uuid, p_kind text, p_description text) returns uuid
language plpgsql security definer as $$
declare a record; nid uuid;
begin
  select * into a from actor(p_token);
  if not has_right(a.member_id, 'signaler_nc') then raise exception 'Ce poste ne peut pas signaler'; end if;
  insert into nonconformity(company_id, kind, description, opened_by) values (a.company_id, p_kind, p_description, a.member_id)
  returning id into nid;
  return nid;
end $$;

create or replace function rpc_nc_etape(p_token uuid, p_nc uuid, p_step text, p_content text) returns void
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'nonconformity', p_nc);
  insert into nc_step(nc_id, step, content, member_id) values (p_nc, p_step, p_content, a.member_id);
end $$;

grant execute on function
  rpc_huile(uuid, uuid, text, numeric, numeric, text[], boolean, boolean),
  rpc_reception(uuid, text, text, text, date, numeric, boolean, boolean, boolean, boolean, boolean, text, text, boolean, text),
  rpc_produit_scanne(uuid, text), rpc_preparation(uuid, uuid), rpc_jeter_lot(uuid, uuid),
  rpc_signaler(uuid, text, text), rpc_nc_etape(uuid, uuid, text, text) to authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.prosecdef loop
    execute format('alter function %s set search_path = norma, public, extensions', f.sig);
  end loop;
end $$;
