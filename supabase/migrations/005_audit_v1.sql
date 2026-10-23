-- NORMA — 005 : fonctions ajoutées depuis l'audit de conformité v1 (événements, pauses et corrections d'heures,
-- notice LPD, formation 5/5, checklists, maintien au chaud, produits entamés, documents, mode inspecteur,
-- coupure de courant, réglages) + fonctions de LECTURE (jsonb) utilisées par l'app.
-- Même modèle : aucune écriture directe ; chaque action passe par une fonction qui vérifie l'acteur et ses droits.
set search_path = norma, public, extensions;

-- ================================================================ référentiel
-- Cuisson : valeur officielle trouvée dans le guide BPHR (validé OSAV), 2.4.4 : 70 °C à cœur pendant 2 min
update official_limit set min_value = 70, source = 'Guide BPHR 2.4.4 (validé OSAV) : 70 °C à cœur, 2 min' where type = 'cuisson';
update official_limit set source = 'Guide BPHR 2.4.4 : 175 °C max (huile)' where type = 'friteuse';

alter table company add column address text, add column phone text, add column email text, add column responsable text;
update company set address = 'Bussigny, Suisse', phone = '078 352 12 02', email = 'info@originalscompletos.ch',
  responsable = 'Orlando Quispe Oscco' where name = 'Original''s Completos';

alter table nonconformity drop constraint nonconformity_kind_check;
alter table nonconformity add constraint nonconformity_kind_check check (kind in ('temperature','huile','reception',
  'corps_etranger','coupure_courant','hygiene','autre','allergie','intoxication','nuisibles','materiel','checklist','maintien_chaud'));

create or replace function nc_label(k text) returns text language sql immutable as $$
  select case k when 'temperature' then 'Température' when 'huile' then 'Huile' when 'reception' then 'Réception'
    when 'corps_etranger' then 'Corps étranger' when 'coupure_courant' then 'Coupure de courant' when 'hygiene' then 'Hygiène'
    when 'allergie' then 'Réaction allergique' when 'intoxication' then 'Plainte / suspicion d’intoxication'
    when 'nuisibles' then 'Nuisibles' when 'materiel' then 'Matériel' when 'checklist' then 'Checklist'
    when 'maintien_chaud' then 'Maintien au chaud' else 'Autre' end;
$$;

-- Heure et date suisses pour l'affichage (le serveur est en UTC)
create or replace function hm(t timestamptz) returns text language sql stable as $$ select to_char(t at time zone 'Europe/Zurich', 'HH24:MI') $$;
create or replace function dmy(d date) returns text language sql immutable as $$ select to_char(d, 'DD.MM.YYYY') $$;
create or replace function local_day(t timestamptz) returns date language sql stable as $$ select (t at time zone 'Europe/Zurich')::date $$;
create or replace function today_ch() returns date language sql stable security definer as $$ select local_day(now()) $$;
create or replace function day_start(d date) returns timestamptz language sql stable as $$ select (d::timestamp at time zone 'Europe/Zurich') $$;
create or replace function fmt1(v numeric) returns text language sql immutable as $$ select replace(replace(to_char(v, 'FM990.0'), '.', ','), '-', '−') $$;

-- Prise de poste « aujourd'hui » = jour suisse
create or replace function is_fit_today(p_member uuid) returns boolean language sql stable as $$
  select coalesce((select apte and tenue_ok and bijoux_ok and mains_ok from shift_check
    where member_id = p_member and local_day(at) = today_ch() order by at desc limit 1), false);
$$;
alter table prep_lot alter column produced_on set default (now() at time zone 'Europe/Zurich')::date;

-- ================================================================ membres : notice LPD, formation
alter table member add column privacy_ack_at timestamptz, add column privacy_version text;

create table training_record (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  score int not null check (score between 0 and 5),
  at timestamptz not null default now()
);
create trigger training_record_no_update before update or delete on training_record for each row execute function forbid_change();

-- ================================================================ pointage : pauses (OLT 1 art. 73 al. 1 let. e) et corrections tracées
alter table time_entry drop constraint time_entry_kind_check;
alter table time_entry add constraint time_entry_kind_check check (kind in ('arrivee','depart','pause_debut','pause_fin'));

-- Correction d'un service par le Gérant ou le Manager : nouvelle version complète, l'ancienne reste (ajout seul)
create table shift_override (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  arrivee_id uuid not null references time_entry(id),
  start_at timestamptz not null,
  end_at timestamptz,
  breaks jsonb not null default '[]',
  what text not null,
  reason text not null check (length(btrim(reason)) >= 3),
  by_member uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger shift_override_no_update before update or delete on shift_override for each row execute function forbid_change();

create or replace function last_arrivee(p_member uuid) returns time_entry language sql stable as $$
  select * from time_entry where member_id = p_member and kind = 'arrivee' and corrects_id is null order by at desc limit 1;
$$;

-- Pointé = dernière arrivée sans départ ensuite, et pas fermée par une correction
create or replace function is_clocked_in(p_member uuid) returns boolean language plpgsql stable as $$
declare a time_entry; o shift_override;
begin
  a := last_arrivee(p_member);
  if a.id is null then return false; end if;
  if exists (select 1 from time_entry d where d.member_id = p_member and d.kind = 'depart' and d.corrects_id is null and d.at >= a.at) then
    return false; end if;
  select * into o from shift_override where arrivee_id = a.id order by at desc limit 1;
  return o.id is null or o.end_at is null;
end $$;

create or replace function on_break(p_member uuid) returns boolean language plpgsql stable as $$
declare a time_entry; k text;
begin
  if not is_clocked_in(p_member) then return false; end if;
  a := last_arrivee(p_member);
  select kind into k from time_entry where member_id = p_member and kind in ('pause_debut','pause_fin') and corrects_id is null
    and at >= a.at order by at desc limit 1;
  return k = 'pause_debut';
end $$;

create or replace function time_entry_before() returns trigger language plpgsql as $$
begin
  if new.corrects_id is not null then
    if new.corrected_by is null or not has_right(new.corrected_by, 'heures_equipe') then
      raise exception 'Correction d''heures réservée au Gérant et au Manager';
    end if;
    return new;
  end if;
  if new.kind = 'arrivee' and is_clocked_in(new.member_id) then raise exception 'Pointage incohérent : arrivee déjà enregistré'; end if;
  if new.kind = 'depart' and not is_clocked_in(new.member_id) then raise exception 'Pointage incohérent : depart déjà enregistré'; end if;
  if new.kind = 'pause_debut' then
    if not is_clocked_in(new.member_id) then raise exception 'Pas pointé'; end if;
    if on_break(new.member_id) then raise exception 'Déjà en pause'; end if;
  end if;
  if new.kind = 'pause_fin' and not on_break(new.member_id) then raise exception 'Pas en pause'; end if;
  return new;
end $$;

-- Dépointer termine aussi une pause en cours
create or replace function depointer(p_member uuid) returns void language plpgsql as $$
begin
  if not is_clocked_in(p_member) then raise exception 'Personne non pointée'; end if;
  if on_break(p_member) then
    insert into time_entry(company_id, member_id, kind) select company_id, p_member, 'pause_fin' from member where id = p_member;
  end if;
  insert into time_entry(company_id, member_id, kind) select company_id, p_member, 'depart' from member where id = p_member;
end $$;

-- Services reconstitués (arrivée → départ, pauses), corrections appliquées
create or replace function shifts_json(p_company uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable as $$
declare a record; res jsonb := '[]'; e_raw timestamptz; nxt timestamptz; brk jsonb; o shift_override; corr jsonb;
  s_at timestamptz; e_at timestamptz; b record; open_b timestamptz;
begin
  for a in select t.*, m.first_name, p.name as poste from time_entry t join member m on m.id = t.member_id join poste p on p.id = m.poste_id
           where t.company_id = p_company and t.kind = 'arrivee' and t.corrects_id is null and t.at < p_to order by t.at desc loop
    select min(at) into nxt from time_entry where member_id = a.member_id and kind = 'arrivee' and corrects_id is null and at > a.at;
    select min(at) into e_raw from time_entry where member_id = a.member_id and kind = 'depart' and corrects_id is null
      and at >= a.at and (nxt is null or at < nxt);
    brk := '[]'; open_b := null;
    for b in select kind, at from time_entry where member_id = a.member_id and kind in ('pause_debut','pause_fin') and corrects_id is null
             and at >= a.at and (nxt is null or at < nxt) order by at loop
      if b.kind = 'pause_debut' then open_b := b.at;
      elsif open_b is not null then brk := brk || jsonb_build_object('start', open_b, 'end', b.at); open_b := null; end if;
    end loop;
    if open_b is not null then brk := brk || jsonb_build_object('start', open_b, 'end', null); end if;
    s_at := a.at; e_at := e_raw;
    select * into o from shift_override where arrivee_id = a.id order by at desc limit 1;
    if o.id is not null then s_at := o.start_at; e_at := o.end_at; brk := o.breaks; end if;
    if s_at < p_to and coalesce(e_at, now()) >= p_from then
      select coalesce(jsonb_agg(jsonb_build_object('at', so.at, 'by', m2.first_name, 'what', so.what, 'reason', so.reason) order by so.at), '[]')
        into corr from shift_override so join member m2 on m2.id = so.by_member where so.arrivee_id = a.id;
      res := res || jsonb_build_object('id', a.id, 'memberId', a.member_id, 'prenom', a.first_name, 'poste', a.poste,
        'eventId', (select id from event where company_id = p_company and local_day(s_at) between start_date and end_date limit 1),
        'start', s_at, 'end', e_at, 'breaks', brk, 'corrections', corr);
    end if;
  end loop;
  return res;
end $$;

-- ================================================================ checklists, maintien au chaud, produits entamés
create table checklist_run (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  mode text not null check (mode in ('montage','ouverture','fermeture')),
  event_id uuid references event(id),
  answers jsonb not null,
  labels jsonb not null,
  at timestamptz not null default now()
);
create trigger checklist_run_no_update before update or delete on checklist_run for each row execute function forbid_change();

create table hot_batch (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  product text not null,
  member_id uuid not null references member(id),
  started_at timestamptz not null default now()
);
create trigger hot_batch_no_update before update or delete on hot_batch for each row execute function forbid_change();
create table hot_batch_end (
  batch_id uuid primary key references hot_batch(id),
  how text not null check (how in ('vendu','jete')),
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger hot_batch_end_no_update before update or delete on hot_batch_end for each row execute function forbid_change();

create table open_product (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  member_id uuid not null references member(id),
  opened_on date not null default (now() at time zone 'Europe/Zurich')::date,
  use_by date not null,
  at timestamptz not null default now()
);
create trigger open_product_no_update before update or delete on open_product for each row execute function forbid_change();
create table open_product_disposal (
  product_id uuid primary key references open_product(id),
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger open_product_disposal_no_update before update or delete on open_product_disposal for each row execute function forbid_change();

-- ================================================================ documents, revue HACCP, inspecteur, coupure de courant
create table admin_doc (
  company_id uuid not null references company(id),
  code text not null,
  name text not null,
  status text not null check (status in ('ok','manquant','a_jour')),
  detail text not null default '',
  pos int not null default 0,
  primary key (company_id, code)
);
create trigger audit_admin_doc after insert or update on admin_doc for each row execute function audit();
create or replace function seed_admin_docs(p_company uuid) returns void language sql as $$
  insert into admin_doc(company_id, code, name, status, detail, pos)
  select p_company, d.code, d.name, d.status, d.detail, d.pos from (values
    ('ofco', 'Annonce à l’OFCO (art. 20 ODAlOUs)', 'manquant', 'À faire avant le prochain événement', 1),
    ('adresse', 'Attestation d’adresse en Suisse', 'ok', 'À présenter sur le stand', 2),
    ('rc', 'Extrait du registre du commerce', 'ok', 'PDF déposé', 3),
    ('haccp', 'Plan HACCP', 'a_jour', 'Mettre à jour selon l’audit de conformité', 4),
    ('bphr', 'Guide BPHR (imprimé dans le classeur)', 'ok', 'Référence des seuils', 5),
    ('affiche', 'Affichette « allergènes sur demande »', 'ok', 'Imprimée par l’entreprise', 6),
    ('entretien', 'Entretien des équipements (rapports de service)', 'a_jour', 'Noter chaque entretien ou réparation', 7)
  ) as d(code, name, status, detail, pos)
  on conflict do nothing;
$$;
select seed_admin_docs(id) from company;
create or replace function company_docs() returns trigger language plpgsql as $$
begin perform seed_admin_docs(new.id); return new; end $$;
create trigger company_seed_docs after insert on company for each row execute function company_docs();

create table haccp_review (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger haccp_review_no_update before update or delete on haccp_review for each row execute function forbid_change();

create table inspector_access (
  token uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  opened_by uuid not null references member(id),
  until timestamptz not null,
  closed_at timestamptz,
  at timestamptz not null default now()
);
create table access_log (
  id bigserial primary key,
  company_id uuid not null references company(id),
  who text not null,
  action text not null,
  at timestamptz not null default now()
);
create trigger access_log_no_update before update or delete on access_log for each row execute function forbid_change();

create table outage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  nc_id uuid not null references nonconformity(id),
  member_id uuid not null references member(id),
  started_at timestamptz not null default now()
);
create trigger outage_no_update before update or delete on outage for each row execute function forbid_change();
create table outage_end (
  outage_id uuid primary key references outage(id),
  member_id uuid not null references member(id),
  at timestamptz not null default now()
);
create trigger outage_end_no_update before update or delete on outage_end for each row execute function forbid_change();

-- ================================================================ réglages : plan de nettoyage libre, événements, plats
alter table cleaning_item drop constraint cleaning_item_frequency_check;
alter table cleaning_item add constraint cleaning_item_frequency_check
  check (frequency in ('intervalle','changement_tache','fin_service','fin_journee','quotidien','libre'));
alter table cleaning_item add column label text;
create trigger audit_cleaning_item after insert or update on cleaning_item for each row execute function audit();

alter table event add column place text not null default '', add column organizer text not null default '',
  add column ofco_ref text not null default '', add column notes text not null default '';
create table event_member (event_id uuid references event(id) on delete cascade, member_id uuid references member(id), primary key (event_id, member_id));
create table event_equipment (event_id uuid references event(id) on delete cascade, equipment_id uuid references equipment(id), primary key (event_id, equipment_id));
create trigger audit_event after insert or update or delete on event for each row execute function audit();

create table dish (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name text not null,
  ingredients text[] not null default '{}',
  allergens text[] not null default '{}' check (allergens <@ array['gluten','crustaces','oeufs','poisson','arachides','soja','lait','fruits_coque','celeri','moutarde','sesame','sulfites','lupin','mollusques']),
  meat_origin text,
  active boolean not null default true
);
create trigger audit_dish after insert or update on dish for each row execute function audit();

-- ================================================================ acteurs et contrôles
-- Membre connecté sur l'iPhone (Gérant / Manager), sans session tablette
create or replace function iphone_member() returns member language plpgsql stable security definer as $$
declare m member;
begin
  select * into m from member where auth_user_id = auth.uid() and active;
  if m.id is null then raise exception 'Accès refusé'; end if;
  return m;
end $$;

create or replace function need(p_member uuid, p_right right_code, p_msg text) returns void language plpgsql stable as $$
begin
  if not has_right(p_member, p_right) then raise exception '%', p_msg; end if;
end $$;

create or replace function droits_de(p_member uuid) returns right_code[] language sql stable as $$
  select case when p.is_owner then enum_range(null::right_code) else array(select distinct unnest(p.rights || m.extra_rights)) end
  from member m join poste p on p.id = m.poste_id where m.id = p_member;
$$;

create or replace function session_json(p_member uuid, p_token uuid, p_arrivee boolean) returns jsonb language sql stable as $$
  select jsonb_build_object('token', p_token, 'memberId', m.id, 'langue', m.lang, 'prenom', m.first_name, 'poste', p.name,
    'arrivee', p_arrivee, 'droits', to_jsonb(droits_de(m.id)), 'aptToday', is_fit_today(m.id),
    'privacyAck', m.privacy_ack_at is not null, 'onBreak', on_break(m.id),
    'trained', exists (select 1 from training_record t where t.member_id = m.id and t.score = 5))
  from member m join poste p on p.id = m.poste_id where m.id = p_member;
$$;

-- ================================================================ RPC : sessions
create or replace function rpc_ouvrir(p_pin text) returns jsonb language plpgsql security definer as $$
declare r record;
begin
  select * into r from rpc_ouvrir_session(p_pin);
  return session_json(r.member_id, r.token, r.arrivee);
end $$;

-- Qui est connecté ? Appareil du stand ou membre (iPhone). Sert au démarrage de l'app.
create or replace function rpc_moi() returns jsonb language plpgsql stable security definer as $$
declare d device; m member;
begin
  select * into d from device where auth_user_id = auth.uid() and active;
  if d.id is not null then return jsonb_build_object('kind', 'device', 'name', d.name); end if;
  select * into m from member where auth_user_id = auth.uid() and active;
  if m.id is null then return jsonb_build_object('kind', 'none'); end if;
  if not (has_right(m.id, 'tableau_bord') and has_right(m.id, 'gestion_equipe')) then
    return jsonb_build_object('kind', 'employee'); end if;
  return jsonb_build_object('kind', 'direction', 'session', session_json(m.id, null, false));
end $$;

create or replace function rpc_pause(p_token uuid, p_debut boolean) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  insert into time_entry(company_id, member_id, kind) values (a.company_id, a.member_id, case when p_debut then 'pause_debut' else 'pause_fin' end);
end $$;

create or replace function rpc_notice_lue(p_token uuid, p_version text) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  update member set privacy_ack_at = now(), privacy_version = p_version where id = a.member_id;
end $$;

-- Chaque tentative est enregistrée ; réussite = 5 sur 5 (l'app affiche le message en cas d'échec)
create or replace function rpc_formation(p_token uuid, p_score int) returns boolean language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  insert into training_record(company_id, member_id, score) values (a.company_id, a.member_id, p_score);
  return p_score = 5;
end $$;

-- ================================================================ RPC : actions du stand
create or replace function rpc_checklist(p_token uuid, p_mode text, p_answers jsonb, p_labels jsonb) returns int
language plpgsql security definer as $$
declare a record; k text; n int := 0; ev uuid;
begin
  select * into a from actor(p_token);
  select id into ev from event where company_id = a.company_id and today_ch() between start_date and end_date limit 1;
  insert into checklist_run(company_id, member_id, mode, event_id, answers, labels) values (a.company_id, a.member_id, p_mode, ev, p_answers, p_labels);
  for k in select key from jsonb_each(p_answers) where value = 'false'::jsonb loop
    insert into nonconformity(company_id, kind, description, opened_by)
    values (a.company_id, 'checklist', 'Checklist ' || p_mode || ' : ' || coalesce(p_labels ->> k, k) || ' : NON', a.member_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function rpc_chaud_debut(p_token uuid, p_product text) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  if not (has_right(a.member_id, 'releves') or has_right(a.member_id, 'preparations')) then raise exception 'Ce poste ne gère pas le maintien au chaud'; end if;
  insert into hot_batch(company_id, product, member_id) values (a.company_id, p_product, a.member_id);
end $$;

create or replace function rpc_chaud_fin(p_token uuid, p_batch uuid, p_how text) returns void language plpgsql security definer as $$
declare a record; h hot_batch;
begin
  select * into a from actor(p_token);
  select * into h from hot_batch where id = p_batch and company_id = a.company_id;
  if h.id is null then raise exception 'Élément inconnu'; end if;
  if exists (select 1 from hot_batch_end where batch_id = p_batch) then raise exception 'Déjà terminé'; end if;
  if p_how = 'vendu' and now() - h.started_at > interval '3 hours' then raise exception 'Plus de 3 h au chaud : élimination obligatoire'; end if;
  insert into hot_batch_end(batch_id, how, member_id) values (p_batch, p_how, a.member_id);
end $$;

create or replace function rpc_produit_entame(p_token uuid, p_name text, p_days int) returns jsonb language plpgsql security definer as $$
declare a record; p open_product;
begin
  select * into a from actor(p_token);
  perform need(a.member_id, 'preparations', 'Ce poste n’a pas le droit d’étiqueter un produit');
  if p_days not between 0 and 30 then raise exception 'Durée après ouverture invalide'; end if;
  insert into open_product(company_id, name, member_id, use_by) values (a.company_id, p_name, a.member_id, today_ch() + p_days) returning * into p;
  return jsonb_build_object('id', p.id, 'kind', 'ouvert', 'recipeName', p.name || ' (entamé)', 'lotCode', 'Ouvert le ' || dmy(p.opened_on),
    'producedOn', p.opened_on, 'useBy', p.use_by, 'by', (select first_name from member where id = a.member_id),
    'status', case when p.use_by = today_ch() then 'aujourd_hui' else 'a_garder' end, 'disposed', null);
end $$;

-- Jeter : lot de préparation ou produit entamé
create or replace function rpc_jeter(p_token uuid, p_id uuid) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  if exists (select 1 from open_product where id = p_id and company_id = a.company_id) then
    perform need(a.member_id, 'jeter_lot', 'Ce poste n’a pas le droit de jeter un lot');
    if exists (select 1 from open_product_disposal where product_id = p_id) then raise exception 'Lot déjà jeté'; end if;
    insert into open_product_disposal(product_id, member_id) values (p_id, a.member_id);
  else
    perform own_row(a.company_id, 'prep_lot', p_id);
    if exists (select 1 from lot_disposal where lot_id = p_id) then raise exception 'Lot déjà jeté'; end if;
    insert into lot_disposal(lot_id, member_id) values (p_id, a.member_id);
  end if;
end $$;

-- Signalement : la coupure de courant démarre le minuteur de 30 min
create or replace function rpc_signaler2(p_token uuid, p_kind text, p_description text) returns uuid language plpgsql security definer as $$
declare a record; nid uuid;
begin
  select * into a from actor(p_token);
  perform need(a.member_id, 'signaler_nc', 'Ce poste ne peut pas signaler');
  insert into nonconformity(company_id, kind, description, opened_by) values (a.company_id, p_kind, p_description, a.member_id) returning id into nid;
  if p_kind = 'coupure_courant' and not exists (select 1 from outage o where o.company_id = a.company_id
       and not exists (select 1 from outage_end e where e.outage_id = o.id)) then
    insert into outage(company_id, nc_id, member_id) values (a.company_id, nid, a.member_id);
  end if;
  return nid;
end $$;

create or replace function rpc_courant_retabli(p_token uuid) returns void language plpgsql security definer as $$
declare a record; o outage; mins int;
begin
  select * into a from actor(p_token);
  select * into o from outage x where x.company_id = a.company_id and not exists (select 1 from outage_end e where e.outage_id = x.id)
    order by started_at desc limit 1;
  if o.id is null then return; end if;
  insert into outage_end(outage_id, member_id) values (o.id, a.member_id);
  mins := round(extract(epoch from now() - o.started_at) / 60);
  insert into nc_step(nc_id, step, content, member_id) values (o.nc_id, 'mesure_immediate',
    'Courant rétabli après ' || mins || ' min' || case when mins > 30 then ' (plus de 30 min : relevés obligatoires, décider garder ou jeter)' else '' end, a.member_id);
end $$;

-- ================================================================ RPC : Direction (iPhone)
create or replace function rpc_correction_heures(p_arrivee uuid, p_start timestamptz, p_end timestamptz, p_breaks jsonb, p_what text, p_reason text)
returns void language plpgsql security definer as $$
declare m member; t time_entry; b jsonb;
begin
  m := iphone_member();
  perform need(m.id, 'heures_equipe', 'Correction des heures non autorisée');
  select * into t from time_entry where id = p_arrivee and company_id = m.company_id and kind = 'arrivee';
  if t.id is null then raise exception 'Élément inconnu'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Indiquez le motif de la correction'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'Le départ doit être après l’arrivée'; end if;
  for b in select * from jsonb_array_elements(coalesce(p_breaks, '[]')) loop
    if (b->>'start')::timestamptz < p_start or (p_end is not null and (b->>'start')::timestamptz > p_end) then raise exception 'Une pause est en dehors du service'; end if;
    if b->>'end' is not null and (b->>'end')::timestamptz <= (b->>'start')::timestamptz then raise exception 'Une pause finit avant de commencer'; end if;
    if b->>'end' is not null and p_end is not null and (b->>'end')::timestamptz > p_end then raise exception 'Une pause est en dehors du service'; end if;
  end loop;
  insert into shift_override(company_id, arrivee_id, start_at, end_at, breaks, what, reason, by_member)
  values (m.company_id, p_arrivee, p_start, p_end, coalesce(p_breaks, '[]'), coalesce(p_what, 'correction'), btrim(p_reason), m.id);
end $$;

create or replace function new_pin(p_member uuid) returns text language plpgsql security definer as $$
declare p text; i int := 0;
begin
  loop
    p := lpad(floor(random() * 10000)::int::text, 4, '0');
    begin
      perform set_member_pin(p_member, p);
      return p;
    exception when others then
      i := i + 1; if i > 200 then raise exception 'Impossible de générer un code'; end if;
    end;
  end loop;
end $$;

create or replace function rpc_ajouter_membre(p_prenom text, p_nom text, p_poste text, p_lang text) returns text
language plpgsql security definer as $$
declare m member; po poste; nid uuid;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  select * into po from poste where company_id = m.company_id and name = p_poste;
  if po.id is null then raise exception 'Poste inconnu'; end if;
  if po.is_owner or (p_poste = 'Manager' and not has_right(m.id, 'reglages_gerant')) then raise exception 'Seul le Gérant peut nommer un Manager'; end if;
  if length(btrim(coalesce(p_prenom, ''))) = 0 then raise exception 'Prénom obligatoire'; end if;
  insert into member(company_id, poste_id, first_name, last_name, lang)
  values (m.company_id, po.id, btrim(p_prenom), coalesce(btrim(p_nom), ''), coalesce(p_lang, 'fr')) returning id into nid;
  return new_pin(nid);
end $$;

create or replace function rpc_nouveau_code(p_member uuid) returns text language plpgsql security definer as $$
declare m member; t member;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  select * into t from member where id = p_member and company_id = m.company_id;
  if t.id is null then raise exception 'Élément inconnu'; end if;
  if (select is_owner from poste where id = t.poste_id) and not has_right(m.id, 'reglages_gerant') then
    raise exception 'Le code du Gérant ne peut pas être modifié par le Manager'; end if;
  return new_pin(p_member);
end $$;

create or replace function rpc_revue_haccp() returns timestamptz language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Revue du plan HACCP réservée au Gérant');
  insert into haccp_review(company_id, member_id) values (m.company_id, m.id);
  return now();
end $$;

create or replace function rpc_inspecteur_ouvrir() returns jsonb language plpgsql security definer as $$
declare m member; t uuid; u timestamptz := now() + interval '2 hours';
begin
  m := iphone_member();
  perform need(m.id, 'export', 'Mode inspecteur réservé au Gérant et au Manager');
  insert into inspector_access(company_id, opened_by, until) values (m.company_id, m.id, u) returning token into t;
  insert into access_log(company_id, who, action) values (m.company_id, m.first_name, 'Accès inspecteur ouvert (lecture seule, 2 h)');
  return jsonb_build_object('token', t, 'until', u, 'openedBy', m.first_name);
end $$;

create or replace function inspector_company(p_token uuid) returns uuid language plpgsql security definer as $$
declare i inspector_access;
begin
  select * into i from inspector_access where token = p_token and company_id = my_company();
  if i.token is null or i.closed_at is not null or i.until < now() then raise exception 'Accès inspecteur expiré'; end if;
  return i.company_id;
end $$;

create or replace function rpc_inspecteur_fermer(p_token uuid) returns void language plpgsql security definer as $$
declare i inspector_access;
begin
  select * into i from inspector_access where token = p_token and company_id = my_company() and closed_at is null;
  if i.token is null then return; end if;
  update inspector_access set closed_at = now() where token = p_token;
  insert into access_log(company_id, who, action) values (i.company_id, (select first_name from member where id = i.opened_by), 'Accès inspecteur fermé');
end $$;

-- ---------------------------------------------------------------- réglages
create or replace function rpc_materiel(p_id uuid, p_name text, p_type equipment_type, p_min numeric, p_max numeric) returns uuid
language plpgsql security definer as $$
declare m member; e equipment; d_min numeric; d_max numeric; nid uuid;
begin
  m := iphone_member();
  perform need(m.id, 'equipements', 'Gestion du matériel non autorisée');
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'Nom obligatoire'; end if;
  if p_min is not null and p_max is not null and p_min >= p_max then raise exception 'Le minimum doit être inférieur au maximum'; end if;
  select x.dmin, x.dmax into d_min, d_max from (values
    ('froid_positif'::equipment_type, 0::numeric, 4::numeric), ('froid_negatif', null, -18), ('cuisson', 72, null),
    ('maintien_chaud', 65, null), ('friteuse', null, 175)) as x(t, dmin, dmax) where x.t = p_type;
  if p_id is null then
    if (p_min is distinct from d_min or p_max is distinct from d_max) and not has_right(m.id, 'reglages_gerant') then
      raise exception 'Seul le Gérant peut modifier les seuils'; end if;
    insert into equipment(company_id, name, type, min_value, max_value) values (m.company_id, btrim(p_name), p_type, p_min, p_max) returning id into nid;
    return nid;
  end if;
  select * into e from equipment where id = p_id and company_id = m.company_id;
  if e.id is null then raise exception 'Élément inconnu'; end if;
  if (e.min_value is distinct from p_min or e.max_value is distinct from p_max or e.type <> p_type) and not has_right(m.id, 'reglages_gerant') then
    raise exception 'Seul le Gérant peut modifier les seuils'; end if;
  update equipment set name = btrim(p_name), type = p_type, min_value = p_min, max_value = p_max where id = p_id;
  return p_id;
end $$;

-- Retirer un matériel : archivé, ses relevés restent
create or replace function rpc_materiel_retirer(p_id uuid) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'equipements', 'Gestion du matériel non autorisée');
  update equipment set active = false where id = p_id and company_id = m.company_id;
  update cleaning_item set active = false where equipment_id = p_id and company_id = m.company_id;
end $$;

create or replace function rpc_tache_nettoyage(p_id uuid, p_name text, p_product text, p_label text, p_interval int) returns uuid
language plpgsql security definer as $$
declare m member; nid uuid;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut modifier le plan de nettoyage');
  if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_label, ''))) = 0 then raise exception 'Zone et fréquence obligatoires'; end if;
  if p_id is null then
    insert into cleaning_item(company_id, name, kind, product, frequency, interval_minutes, label)
    values (m.company_id, btrim(p_name), 'zone', coalesce(btrim(p_product), ''), case when p_interval is null then 'libre' else 'intervalle' end, p_interval, btrim(p_label))
    returning id into nid;
    return nid;
  end if;
  update cleaning_item set name = btrim(p_name), product = coalesce(btrim(p_product), ''), label = btrim(p_label),
    frequency = case when p_interval is null then 'libre' else 'intervalle' end, interval_minutes = p_interval
  where id = p_id and company_id = m.company_id;
  if not found then raise exception 'Élément inconnu'; end if;
  return p_id;
end $$;

create or replace function rpc_tache_retirer(p_id uuid) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut modifier le plan de nettoyage');
  update cleaning_item set active = false where id = p_id and company_id = m.company_id;
end $$;

create or replace function rpc_droits_poste(p_poste text, p_rights right_code[]) returns void language plpgsql security definer as $$
declare m member; po poste;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut modifier les droits');
  select * into po from poste where company_id = m.company_id and name = p_poste;
  if po.id is null then raise exception 'Poste inconnu'; end if;
  if po.is_owner then raise exception 'Les droits du Gérant ne se modifient pas'; end if;
  update poste set rights = array(select distinct unnest(array['pointage','prise_poste','signaler_nc']::right_code[]
    || array_remove(p_rights, 'reglages_gerant'))) where id = po.id;
end $$;

create or replace function rpc_droits_membre(p_member uuid, p_rights right_code[]) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut modifier les droits');
  update member set extra_rights = array_remove(p_rights, 'reglages_gerant') where id = p_member and company_id = m.company_id;
  if not found then raise exception 'Élément inconnu'; end if;
end $$;

create or replace function rpc_evenement(p_id uuid, p_name text, p_place text, p_start date, p_end date, p_organizer text,
  p_ofco text, p_notes text, p_team uuid[], p_equipment uuid[]) returns uuid language plpgsql security definer as $$
declare m member; eid uuid;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion des événements non autorisée');
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'Nom de l’événement obligatoire'; end if;
  if p_end < p_start then raise exception 'La date de fin est avant la date de début'; end if;
  if p_id is null then
    insert into event(company_id, name, place, start_date, end_date, organizer, ofco_ref, notes)
    values (m.company_id, btrim(p_name), coalesce(p_place, ''), p_start, p_end, coalesce(p_organizer, ''), coalesce(p_ofco, ''), coalesce(p_notes, ''))
    returning id into eid;
  else
    update event set name = btrim(p_name), place = coalesce(p_place, ''), start_date = p_start, end_date = p_end,
      organizer = coalesce(p_organizer, ''), ofco_ref = coalesce(p_ofco, ''), notes = coalesce(p_notes, '')
    where id = p_id and company_id = m.company_id returning id into eid;
    if eid is null then raise exception 'Élément inconnu'; end if;
    delete from event_member where event_id = eid;
    delete from event_equipment where event_id = eid;
  end if;
  insert into event_member select eid, x from unnest(coalesce(p_team, '{}')) x where exists (select 1 from member where id = x and company_id = m.company_id);
  insert into event_equipment select eid, x from unnest(coalesce(p_equipment, '{}')) x where exists (select 1 from equipment where id = x and company_id = m.company_id);
  return eid;
end $$;

-- Supprimer : seulement un événement sans aucun enregistrement pendant ses dates
create or replace function rpc_evenement_supprimer(p_id uuid) returns void language plpgsql security definer as $$
declare m member; e event;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut supprimer un événement');
  select * into e from event where id = p_id and company_id = m.company_id;
  if e.id is null then raise exception 'Élément inconnu'; end if;
  if exists (select 1 from temperature_reading where company_id = m.company_id and local_day(received_at) between e.start_date and e.end_date)
     or exists (select 1 from time_entry where company_id = m.company_id and local_day(at) between e.start_date and e.end_date)
     or exists (select 1 from checklist_run where event_id = e.id) then
    raise exception 'Événement avec des enregistrements : suppression impossible'; end if;
  delete from event where id = p_id;
end $$;

-- ================================================================ RPC : lectures (jsonb)
create or replace function equip_default(e equipment) returns numeric language sql immutable as $$
  select case when e.min_value is not null and e.max_value is not null then (e.min_value + e.max_value) / 2
    when e.min_value is not null then e.min_value + 3 else e.max_value - 2 end;
$$;

create or replace function rpc_lire_materiel() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'type', e.type, 'min', e.min_value, 'max', e.max_value,
    'defaultValue', equip_default(e)) order by e.created_at), '[]')
  from equipment e where e.company_id = my_company() and e.active;
$$;

create or replace function rpc_limites() returns jsonb language sql stable security definer as $$
  select jsonb_object_agg(type, jsonb_build_object('min', min_value, 'max', max_value, 'source', source)) from official_limit;
$$;

create or replace function freq_label(i cleaning_item) returns text language sql immutable as $$
  select coalesce(i.label, case i.frequency when 'intervalle' then 'Toutes les ' || case when i.interval_minutes % 60 = 0 then (i.interval_minutes / 60) || ' h' else i.interval_minutes || ' min' end
    when 'changement_tache' then 'À chaque changement de tâche' when 'fin_service' then 'Fin de service'
    when 'fin_journee' then 'Fin de journée' when 'quotidien' then '1× par jour' else 'À définir dans le plan' end);
$$;

-- Début du service du jour = première arrivée pointée aujourd'hui
create or replace function stand_opened(p_company uuid, p_day date) returns timestamptz language sql stable as $$
  select min(at) from time_entry where company_id = p_company and kind = 'arrivee' and corrects_id is null and local_day(at) = p_day;
$$;

create or replace function rpc_lire_nettoyage(p_now timestamptz) returns jsonb language plpgsql stable security definer as $$
declare c uuid := my_company(); o timestamptz;
begin
  o := coalesce(stand_opened(c, local_day(p_now)), p_now);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'product', i.product, 'frequency', freq_label(i),
      'interval', i.interval_minutes,
      'dueAt', case when i.frequency = 'intervalle' then greatest(coalesce(ld.at, o), o) + make_interval(mins => i.interval_minutes) end,
      'lastDone', case when ld.at is not null then jsonb_build_object('by', ld.first_name, 'at', ld.at) end) order by i.name)
    from cleaning_item i
    left join lateral (select d.at, m.first_name from cleaning_done d join member m on m.id = d.member_id
                       where d.item_id = i.id order by d.at desc limit 1) ld on true
    where i.company_id = c and i.active), '[]');
end $$;

create or replace function who_can(p_company uuid, p_right right_code) returns text language sql stable as $$
  select string_agg(name, ', ' order by is_owner desc, name) from poste where company_id = p_company and (is_owner or p_right = any(rights));
$$;

create or replace function alert_of(d timestamptz, p_now timestamptz) returns text language sql immutable as $$
  select case when p_now > d then 'rouge' when p_now > d - interval '15 minutes' then 'jaune' else 'ok' end;
$$;

create or replace function rpc_alertes(p_now timestamptz) returns jsonb language plpgsql stable security definer as $$
declare c uuid := my_company(); o timestamptz; res jsonb := '[]'; r record; out_ outage; out_end timestamptz; d timestamptz; day date := local_day(p_now);
begin
  o := stand_opened(c, day);
  if o is null then return res; end if;   -- personne n'est encore arrivé : pas d'alerte
  for r in select i.name, greatest(coalesce((select max(at) from cleaning_done where item_id = i.id), o), o) + make_interval(mins => i.interval_minutes) as due
           from cleaning_item i where i.company_id = c and i.active and i.frequency = 'intervalle' loop
    if alert_of(r.due, p_now) <> 'ok' then
      res := res || jsonb_build_object('title', 'Nettoyage : ' || r.name, 'dueAt', r.due, 'alert', alert_of(r.due, p_now), 'who', who_can(c, 'nettoyage'));
    end if;
  end loop;
  if not exists (select 1 from temperature_reading t join equipment e on e.id = t.equipment_id
                 where t.company_id = c and e.type = 'froid_positif' and local_day(t.received_at) = day) then
    d := o + interval '12 minutes';
    if alert_of(d, p_now) <> 'ok' then res := res || jsonb_build_object('title', 'Relevé frigo · ouverture', 'dueAt', d, 'alert', alert_of(d, p_now), 'who', who_can(c, 'releves')); end if;
  end if;
  for r in select h.product, h.started_at + interval '3 hours' as due from hot_batch h
           where h.company_id = c and not exists (select 1 from hot_batch_end x where x.batch_id = h.id) loop
    if alert_of(r.due, p_now) <> 'ok' then
      res := res || jsonb_build_object('title', 'Maintien au chaud : ' || r.product, 'dueAt', r.due, 'alert', alert_of(r.due, p_now), 'who', who_can(c, 'releves'));
    end if;
  end loop;
  select * into out_ from outage where company_id = c order by started_at desc limit 1;
  if out_.id is not null then
    select at into out_end from outage_end where outage_id = out_.id;
    if out_end is null or p_now - out_end < interval '6 hours' then
      d := case when out_end is not null and out_end - out_.started_at < interval '30 minutes' then out_end else out_.started_at + interval '30 minutes' end;
      for r in select e.id, e.name from equipment e where e.company_id = c and e.active and e.type in ('froid_positif','froid_negatif')
                 and not exists (select 1 from temperature_reading t where t.equipment_id = e.id and t.received_at > out_.started_at) loop
        if alert_of(d, p_now) <> 'ok' then
          res := res || jsonb_build_object('title', 'Relevé après coupure : ' || r.name, 'dueAt', d, 'alert', alert_of(d, p_now), 'who', who_can(c, 'releves'));
        end if;
      end loop;
    end if;
  end if;
  if not exists (select 1 from checklist_run where company_id = c and mode = 'ouverture' and local_day(at) = day) then
    d := o + interval '20 minutes';
    if alert_of(d, p_now) <> 'ok' then res := res || jsonb_build_object('title', 'Checklist d’ouverture', 'dueAt', d, 'alert', alert_of(d, p_now), 'who', who_can(c, 'releves')); end if;
  end if;
  return coalesce((select jsonb_agg(x order by x->>'dueAt') from jsonb_array_elements(res) x), '[]');
end $$;

create or replace function rpc_fournisseurs() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(distinct s), '[]') from (
    select supplier as s from product_catalog where company_id = my_company()
    union select supplier from reception where company_id = my_company()
    union select unnest(array['Carnadis Sàrl','Prodega','Aligro','Transgourmet'])) t;
$$;

create or replace function rpc_recettes() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code, 'shelfDays', shelf_days, 'allergens', allergens) order by name), '[]')
  from recipe where company_id = my_company() and active;
$$;

create or replace function lot_state(use_by date, disposed boolean, d date) returns text language sql immutable as $$
  select case when disposed then 'jete' when d > use_by then 'a_jeter' when d = use_by then 'aujourd_hui' else 'a_garder' end;
$$;

-- Lots encore utiles à afficher : non jetés, ou jetés depuis moins de 2 jours
create or replace function rpc_lots(p_now timestamptz) returns jsonb language sql stable security definer as $$
  with d as (select local_day(p_now) as day)
  select coalesce(jsonb_agg(x order by x->>'producedOn' desc), '[]') from (
    select jsonb_build_object('id', l.id, 'kind', 'preparation', 'recipeName', r.name, 'lotCode', l.lot_code, 'producedOn', l.produced_on,
      'useBy', l.use_by, 'by', m.first_name, 'status', lot_state(l.use_by, ld.lot_id is not null, (select day from d)),
      'disposed', case when ld.lot_id is not null then jsonb_build_object('by', m2.first_name, 'at', ld.at) end) as x
    from prep_lot l join recipe r on r.id = l.recipe_id join member m on m.id = l.member_id
    left join lot_disposal ld on ld.lot_id = l.id left join member m2 on m2.id = ld.member_id
    where l.company_id = my_company() and (ld.lot_id is null or ld.at > p_now - interval '2 days')
    union all
    select jsonb_build_object('id', p.id, 'kind', 'ouvert', 'recipeName', p.name || ' (entamé)', 'lotCode', 'Ouvert le ' || dmy(p.opened_on),
      'producedOn', p.opened_on, 'useBy', p.use_by, 'by', m.first_name, 'status', lot_state(p.use_by, pd.product_id is not null, (select day from d)),
      'disposed', case when pd.product_id is not null then jsonb_build_object('by', m2.first_name, 'at', pd.at) end)
    from open_product p join member m on m.id = p.member_id
    left join open_product_disposal pd on pd.product_id = p.id left join member m2 on m2.id = pd.member_id
    where p.company_id = my_company() and (pd.product_id is null or pd.at > p_now - interval '2 days')) t;
$$;

create or replace function rpc_plats() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'ingredients', ingredients, 'allergens', allergens, 'meatOrigin', meat_origin) order by name), '[]')
  from dish where company_id = my_company() and active;
$$;

create or replace function nc_json(n nonconformity) returns jsonb language sql stable as $$
  select jsonb_build_object('id', n.id, 'kind', nc_label(n.kind), 'description', n.description,
    'openedBy', (select first_name from member where id = n.opened_by), 'openedAt', n.opened_at,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'content', s.content, 'by', m.first_name, 'at', s.at) order by s.at)
                       from nc_step s join member m on m.id = s.member_id where s.nc_id = n.id), '[]'),
    'closed', exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture'));
$$;

create or replace function rpc_incidents() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(nc_json(n) order by n.opened_at desc), '[]') from nonconformity n
  where n.company_id = my_company() and (n.opened_at > now() - interval '30 days'
    or not exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture'));
$$;

create or replace function rpc_equipe() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'prenom', m.first_name, 'poste', p.name, 'clockedIn', is_clocked_in(m.id),
    'since', case when is_clocked_in(m.id) then (last_arrivee(m.id)).at end,
    'aptToday', (select apte and tenue_ok and bijoux_ok and mains_ok from shift_check s where s.member_id = m.id and local_day(s.at) = today_ch() order by s.at desc limit 1))
    order by p.is_owner desc, m.first_name), '[]')
  from member m join poste p on p.id = m.poste_id where m.company_id = my_company() and m.active;
$$;

create or replace function rpc_postes() returns jsonb language sql stable security definer as $$
  select jsonb_object_agg(name, case when is_owner then to_jsonb(enum_range(null::right_code)) else to_jsonb(rights) end) from poste where company_id = my_company();
$$;

create or replace function rpc_droits_individuels() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_object_agg(id, extra_rights), '{}') from member where company_id = my_company() and active and cardinality(extra_rights) > 0;
$$;

create or replace function rpc_checklist_faite(p_mode text) returns boolean language sql stable security definer as $$
  select case when p_mode = 'montage' then exists (
      select 1 from checklist_run r join event e on e.id = r.event_id
      where r.company_id = my_company() and r.mode = 'montage' and today_ch() between e.start_date and e.end_date)
    else exists (select 1 from checklist_run where company_id = my_company() and mode = p_mode and local_day(at) = today_ch()) end;
$$;

create or replace function rpc_bacs_chauds() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'product', h.product, 'startedAt', h.started_at, 'by', m.first_name,
    'ended', case when x.batch_id is not null then jsonb_build_object('at', x.at, 'how', x.how, 'by', m2.first_name) end) order by h.started_at desc), '[]')
  from hot_batch h join member m on m.id = h.member_id left join hot_batch_end x on x.batch_id = h.id left join member m2 on m2.id = x.member_id
  where h.company_id = my_company() and h.started_at > now() - interval '1 day';
$$;

create or replace function rpc_documents() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', code, 'name', name, 'status', status, 'detail', detail) order by pos), '[]')
  from admin_doc where company_id = my_company();
$$;

create or replace function rpc_derniere_revue() returns timestamptz language sql stable security definer as $$
  select max(at) from haccp_review where company_id = my_company();
$$;

create or replace function rpc_heures(p_from timestamptz, p_to timestamptz) returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'heures_equipe', 'Heures de l’équipe non autorisées');
  return shifts_json(m.company_id, p_from, p_to);
end $$;

create or replace function rpc_alertes_heures(p_now timestamptz) returns jsonb language plpgsql stable security definer as $$
declare m member; s jsonb; res jsonb := '[]';
begin
  m := iphone_member();
  if not has_right(m.id, 'heures_equipe') then return res; end if;
  for s in select * from jsonb_array_elements(shifts_json(m.company_id, p_now - interval '7 days', p_now)) loop
    if s->>'end' is null and p_now - (s->>'start')::timestamptz > interval '10 hours' then
      res := res || jsonb_build_object('entryId', s->>'id', 'prenom', s->>'prenom', 'since', s->>'start',
        'hours', floor(extract(epoch from p_now - (s->>'start')::timestamptz) / 3600));
    end if;
  end loop;
  return res;
end $$;

create or replace function rpc_lectures_notice() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', m.first_name || ' (' || p.name || ')',
    'at', to_char(m.privacy_ack_at at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI:SS')) order by m.privacy_ack_at), '[]')
  from member m join poste p on p.id = m.poste_id where m.company_id = my_company() and m.privacy_ack_at is not null;
$$;

create or replace function rpc_journal() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'who', who, 'action', action) order by at desc), '[]')
  from (select * from access_log where company_id = my_company() order by at desc limit 50) t;
$$;

create or replace function rpc_coupure() returns jsonb language sql stable security definer as $$
  select (select jsonb_build_object('start', o.started_at, 'end', e.at, 'by', m.first_name)
    from outage o join member m on m.id = o.member_id left join outage_end e on e.outage_id = o.id
    where o.company_id = my_company() and (e.at is null or e.at > now() - interval '6 hours') order by o.started_at desc limit 1);
$$;

create or replace function event_json(e event) returns jsonb language sql stable as $$
  select jsonb_build_object('id', e.id, 'name', e.name, 'place', e.place, 'start', e.start_date, 'end', e.end_date, 'organizer', e.organizer,
    'ofcoRef', e.ofco_ref, 'notes', e.notes,
    'team', coalesce((select jsonb_agg(member_id) from event_member where event_id = e.id), '[]'),
    'equipment', coalesce((select jsonb_agg(equipment_id) from event_equipment where event_id = e.id), '[]'));
$$;

create or replace function rpc_evenements() returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(event_json(e) order by e.start_date desc), '[]') from event e where e.company_id = my_company();
$$;

create or replace function rpc_evenement_courant(p_day date) returns jsonb language sql stable security definer as $$
  select event_json(e) from event e where e.company_id = my_company() and p_day between e.start_date and e.end_date order by e.start_date limit 1;
$$;

create or replace function rpc_bilan_evenement(p_id uuid, p_now timestamptz) returns jsonb language plpgsql stable security definer as $$
declare e event; c uuid := my_company(); f timestamptz; t timestamptz; h numeric := 0; s jsonb; b jsonb; mins numeric;
begin
  select * into e from event where id = p_id and company_id = c;
  if e.id is null then raise exception 'Élément inconnu'; end if;
  f := day_start(e.start_date); t := day_start(e.end_date + 1);
  for s in select * from jsonb_array_elements(shifts_json(c, f, t)) loop
    mins := extract(epoch from coalesce((s->>'end')::timestamptz, p_now) - (s->>'start')::timestamptz) / 60;
    for b in select * from jsonb_array_elements(s->'breaks') loop
      mins := mins - extract(epoch from coalesce((b->>'end')::timestamptz, p_now) - (b->>'start')::timestamptz) / 60;
    end loop;
    h := h + greatest(mins, 0) / 60;
  end loop;
  return jsonb_build_object('jours', e.end_date - e.start_date + 1,
    'releves', (select count(*) from temperature_reading where company_id = c and received_at >= f and received_at < t),
    'relevesRouges', (select count(*) from temperature_reading where company_id = c and received_at >= f and received_at < t and status = 'rouge'),
    'ncOuvertes', (select count(*) from nonconformity n where company_id = c and opened_at >= f and opened_at < t
                   and not exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture')),
    'ncCloturees', (select count(*) from nonconformity n where company_id = c and opened_at >= f and opened_at < t
                   and exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture')),
    'nettoyages', (select count(*) from cleaning_done d join cleaning_item i on i.id = d.item_id where i.company_id = c and d.at >= f and d.at < t),
    'receptions', (select count(*) from reception where company_id = c and at >= f and at < t),
    'lotsProduits', (select count(*) from prep_lot where company_id = c and produced_on between e.start_date and e.end_date),
    'lotsJetes', (select count(*) from lot_disposal d join prep_lot l on l.id = d.lot_id where l.company_id = c and d.at >= f and d.at < t),
    'heures', round(h, 1),
    'personnes', (select count(distinct member_id) from time_entry where company_id = c and kind = 'arrivee' and at >= f and at < t),
    'checklistsMontage', exists (select 1 from checklist_run where event_id = e.id and mode = 'montage'));
end $$;

create or replace function rpc_stats_jour(p_now timestamptz) returns jsonb language plpgsql stable security definer as $$
declare c uuid := my_company(); f timestamptz := day_start(local_day(p_now));
begin
  return jsonb_build_object(
    'releves', (select count(*) from temperature_reading where company_id = c and received_at >= f),
    'relevesRouges', (select count(*) from temperature_reading where company_id = c and received_at >= f and status = 'rouge'),
    'nettoyagesFaits', (select count(*) from cleaning_done d join cleaning_item i on i.id = d.item_id where i.company_id = c and d.at >= f),
    'nettoyagesEnRetard', (select count(*) from jsonb_array_elements(rpc_alertes(p_now)) a where a->>'alert' = 'rouge' and a->>'title' like 'Nettoyage%'),
    'lotsAJeter', (select count(*) from jsonb_array_elements(rpc_lots(p_now)) l where l->>'status' = 'a_jeter'),
    'receptions', (select count(*) from reception where company_id = c and at >= f));
end $$;

-- ---------------------------------------------------------------- rapport du jour (même contenu que le PDF)
create or replace function report_json(c uuid, p_day date) returns jsonb language plpgsql stable as $$
declare f timestamptz := day_start(p_day); t timestamptz := day_start(p_day + 1); co company; ev event; missed jsonb := '[]';
  ci record; cx record; due timestamptz; o timestamptz; fin timestamptz;
begin
  select * into co from company where id = c;
  select * into ev from event where company_id = c and p_day between start_date and end_date limit 1;
  -- nettoyages à intervalle non faits à temps (à partir de la première arrivée du jour)
  o := stand_opened(c, p_day);
  if o is not null then
    fin := least(now(), t, coalesce((select max(at) from time_entry where company_id = c and kind = 'depart' and at >= f and at < t), t));
    for ci in select * from cleaning_item where company_id = c and active and frequency = 'intervalle' loop
      due := o + make_interval(mins => ci.interval_minutes);
      for cx in select at from cleaning_done where item_id = ci.id and at >= o and at < t order by at loop
        if cx.at > due then missed := missed || jsonb_build_object('item', ci.name, 'due', hm(due)); end if;
        due := cx.at + make_interval(mins => ci.interval_minutes);
      end loop;
      if fin > due then missed := missed || jsonb_build_object('item', ci.name, 'due', hm(due)); end if;
    end loop;
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object('name', upper(co.name), 'address', coalesce(co.address, ''), 'phone', coalesce(co.phone, ''),
      'email', coalesce(co.email, ''), 'responsable', coalesce(co.responsable, '')),
    'event', case when ev.id is null then 'Hors événement' else ev.name || case when ev.place <> '' then ' · ' || ev.place else '' end
      || ' · jour ' || (p_day - ev.start_date + 1) || '/' || (ev.end_date - ev.start_date + 1) end,
    'date', p_day, 'generatedAt', now(),
    'thresholds', coalesce((select jsonb_agg(jsonb_build_object('label', e.name,
        'value', case when e.min_value is not null and e.max_value is not null then fmt1(e.min_value) || ' à ' || fmt1(e.max_value) || ' °C'
          when e.min_value is not null then '≥ ' || fmt1(e.min_value) || ' °C' else '≤ ' || fmt1(e.max_value) || ' °C' end
          || case e.type when 'maintien_chaud' then ', 3 h max' when 'cuisson' then ', 2 min' else '' end,
        'source', l.source) order by e.created_at)
      from equipment e join official_limit l on l.type = e.type where e.company_id = c and e.active), '[]')
      || jsonb_build_array(jsonb_build_object('label', 'Préparations maison', 'value', 'J+2, ≤ 4 °C', 'source', 'Guide BPHR 6.3.1 (production + 2 jours)')),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('name', s->>'prenom', 'poste', s->>'poste', 'arrival', hm((s->>'start')::timestamptz),
        'departure', case when s->>'end' is not null then hm((s->>'end')::timestamptz) end,
        'pauses', coalesce((select string_agg(hm((b->>'start')::timestamptz) || '–' || coalesce(hm((b->>'end')::timestamptz), '…'), ', ') from jsonb_array_elements(s->'breaks') b), ''),
        'apte', (select apte and tenue_ok and bijoux_ok and mains_ok from shift_check k where k.member_id = (s->>'memberId')::uuid
                 and local_day(k.at) = p_day order by k.at desc limit 1)) order by s->>'start')
      from jsonb_array_elements(shifts_json(c, f, t)) s where local_day((s->>'start')::timestamptz) = p_day or s->>'end' is null), '[]'),
    'readings', coalesce((select jsonb_agg(jsonb_build_object('time', hm(r.received_at), 'equipment', e.name, 'value', fmt1(r.value) || ' °C',
        'status', r.status, 'by', m.first_name, 'source', case r.source_device when 'stand' then 'Tablette' when 'iphone_gerant' then 'iPhone Gérant' else 'iPhone Manager' end) order by r.received_at)
      from temperature_reading r join equipment e on e.id = r.equipment_id join member m on m.id = r.member_id
      where r.company_id = c and r.received_at >= f and r.received_at < t), '[]'),
    'oil', coalesce((select jsonb_agg(jsonb_build_object('time', hm(k.at), 'fryer', e.name, 'moment', initcap(k.moment),
        'temp', case when k.temperature is null then '—' else fmt1(k.temperature) || ' °C' end,
        'polar', case when k.polar_pct is null then '—' else fmt1(k.polar_pct) || ' %' end,
        'aspect', case when cardinality(k.defects) = 0 then 'Normal' else array_to_string(k.defects, ', ') end,
        'actions', coalesce(nullif(concat_ws(' · ', case when k.filtered then 'Filtrée' end, case when k.changed then 'Changée' end,
          case when k.must_change and not k.changed then 'À changer' end), ''), '—'), 'by', m.first_name) order by k.at)
      from oil_check k join equipment e on e.id = k.equipment_id join member m on m.id = k.member_id
      where k.company_id = c and k.at >= f and k.at < t), '[]'),
    'receptions', coalesce((select jsonb_agg(jsonb_build_object('time', hm(r.at), 'supplier', r.supplier, 'product', r.product, 'lot', r.supplier_lot,
        'dlc', dmy(r.dlc), 'temp', fmt1(r.temperature) || ' °C', 'result', case when r.accepted then 'Acceptée' else 'Refusée : ' || r.refusal_reason end,
        'by', m.first_name, 'photo', r.delivery_note_path is not null) order by r.at)
      from reception r join member m on m.id = r.member_id where r.company_id = c and r.at >= f and r.at < t), '[]'),
    'cleaning', coalesce((select jsonb_agg(jsonb_build_object('time', hm(d.at), 'item', i.name, 'product', d.product_used, 'by', m.first_name,
        'note', coalesce(d.anomaly, '')) order by d.at)
      from cleaning_done d join cleaning_item i on i.id = d.item_id join member m on m.id = d.member_id
      where i.company_id = c and d.at >= f and d.at < t), '[]'),
    'cleaningMissed', missed,
    'lots', coalesce((select jsonb_agg(jsonb_build_object('lot', l.lot_code, 'recipe', r.name, 'by', m.first_name, 'useBy', dmy(l.use_by),
        'disposed', case when d.lot_id is null then '—' else 'Jeté ' || hm(d.at) || ' · ' || m2.first_name end) order by l.lot_code)
      from prep_lot l join recipe r on r.id = l.recipe_id join member m on m.id = l.member_id
      left join lot_disposal d on d.lot_id = l.id left join member m2 on m2.id = d.member_id
      where l.company_id = c and l.produced_on <= p_day and (l.use_by >= p_day or local_day(d.at) = p_day)), '[]'),
    'ncs', coalesce((select jsonb_agg(jsonb_build_object('opened', hm(n.opened_at), 'kind', nc_label(n.kind), 'description', n.description,
        'by', m.first_name, 'status', case when exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture') then 'Clôturée' else 'OUVERTE' end,
        'steps', coalesce((select jsonb_agg(hm(s.at) || ' ' || case s.step when 'mesure_immediate' then 'Mesure immédiate' when 'evaluation_risque' then 'Évaluation du risque'
            when 'action_corrective' then 'Action corrective' when 'verification' then 'Vérification' else 'Clôture' end
            || ' : ' || s.content || ' (' || m3.first_name || ')' order by s.at) from nc_step s join member m3 on m3.id = s.member_id where s.nc_id = n.id), '[]'))
        order by n.opened_at)
      from nonconformity n join member m on m.id = n.opened_by
      where n.company_id = c and ((n.opened_at >= f and n.opened_at < t)
        or (n.opened_at < t and not exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture' and s.at < f)))), '[]'));
end $$;

create or replace function rpc_rapport_jour(p_day date) returns jsonb language sql stable security definer as $$
  select report_json(my_company(), p_day);
$$;

create or replace function rpc_inspecteur_jour(p_token uuid, p_day date) returns jsonb language plpgsql security definer as $$
declare c uuid := inspector_company(p_token);
begin
  insert into access_log(company_id, who, action) values (c, 'Inspecteur', 'Registres du ' || dmy(p_day) || ' consultés');
  return report_json(c, p_day);
end $$;

create or replace function rpc_inspecteur_info(p_token uuid) returns jsonb language plpgsql stable security definer as $$
declare c uuid := inspector_company(p_token);
begin
  return jsonb_build_object('thresholds', report_json(c, today_ch())->'thresholds', 'documents', rpc_documents(),
    'haccpReview', (select max(at) from haccp_review where company_id = c),
    'trainings', coalesce((select jsonb_agg(jsonb_build_object('name', m.first_name || ' (' || p.name || ')', 'at', dmy(local_day(t.at)), 'score', t.score) order by t.at)
      from training_record t join member m on m.id = t.member_id join poste p on p.id = m.poste_id
      where t.company_id = c and t.score = 5), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'place', e.place, 'dates', dmy(e.start_date) || ' → ' || dmy(e.end_date),
      'ofco', coalesce(nullif(e.ofco_ref, ''), 'non renseignée')) order by e.start_date desc) from event e where e.company_id = c), '[]'));
end $$;

-- ================================================================ sécurité : RLS sur les nouvelles tables, droits d'exécution
do $$
declare t text;
begin
  foreach t in array array['training_record','shift_override','checklist_run','hot_batch','hot_batch_end','open_product','open_product_disposal',
    'admin_doc','haccp_review','inspector_access','access_log','outage','outage_end','event_member','event_equipment','dish'] loop
    execute format('alter table norma.%I enable row level security', t);
    execute format('revoke all on norma.%I from authenticated', t);
  end loop;
end $$;
revoke all on member from authenticated;
grant select (id, company_id, poste_id, first_name, last_name, lang, active) on member to authenticated;

-- Toutes les fonctions NORMA : chemin de recherche figé ET fuseau suisse (dates « aujourd'hui » correctes).
-- (Concerne aussi les petites fonctions SQL utilitaires : sinon elles seraient recopiées dans la requête de l'appelant.)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.prokind = 'f' loop
    execute format('alter function %s set search_path = norma, public, extensions', f.sig);
    execute format('alter function %s set timezone = %L', f.sig, 'Europe/Zurich');
  end loop;
end $$;

revoke execute on all functions in schema norma from public;
do $$
declare f record;
begin
  -- l'app n'appelle que les fonctions rpc_* (plus les anciennes fonctions déjà ouvertes en 003/004)
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname like 'rpc\_%' loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
grant execute on function my_company(), my_member(), has_right(uuid, right_code), today_ch() to authenticated;
