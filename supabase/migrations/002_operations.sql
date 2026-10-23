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
