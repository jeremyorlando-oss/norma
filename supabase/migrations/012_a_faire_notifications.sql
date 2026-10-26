-- NORMA 012 — « À faire » : pastilles rouges et notifications pour chaque personne (pas seulement la Direction).
-- Chaque compte (Employé, Manager, Gérant) voit ce qu'il doit faire : contrat à signer, document reçu, nouvel événement
-- au planning, fiche personnelle incomplète, notice de protection des données à lire, formation hygiène à faire.
-- Notifications sur le téléphone de la personne (dans sa langue) ; pastille sur l'icône de l'app (nombre de choses à faire).
set search_path = norma, public, extensions;

-- Ce que la personne a déjà vu (nouveaux événements du planning) ; aussi utilisé pour ne notifier qu'une fois
create table member_seen (
  member_id uuid not null references member(id),
  key text not null,
  at timestamptz not null default now(),
  primary key (member_id, key)
);
alter table member_seen enable row level security;

create or replace function tr3(p_lang text, fr text, es text, en text) returns text language sql immutable as $$
  select case p_lang when 'es' then es when 'en' then en else fr end;
$$;

-- Champs de la fiche personnelle encore vides (la date du permis seulement pour un vrai permis, migration 011)
create or replace function profil_manquant(p_member uuid) returns int language sql stable as $$
  select case when p.member_id is null then 13 else
    (p.legal_first_names = '')::int + (p.legal_last_name = '')::int + (p.birth_date is null)::int + (p.nationality = '')::int
    + (p.permit = '')::int + (p.permit not in ('', 'CH') and p.permit_until is null)::int + (p.avs = '')::int + (p.iban = '')::int
    + (p.street = '')::int + (p.npa = '')::int + (p.city = '')::int + (p.phone = '')::int
    + (p.emergency_name = '' or p.emergency_phone = '')::int end
  from (select p_member as id) x left join member_profile p on p.member_id = x.id;
$$;

-- Liste « à faire » d'une personne. urgent = pastille rouge « feu » ; tab = onglet de l'app où agir.
create or replace function a_faire(p_member uuid) returns jsonb language plpgsql stable security definer as $$
declare m member; res jsonb := '[]'; n int; prochain date; soon boolean;
begin
  select * into m from member where id = p_member and active;
  if m.id is null then return res; end if;
  select min(e.start_date) into prochain from event e join event_member em on em.event_id = e.id
    where em.member_id = m.id and e.end_date >= today_ch();
  soon := prochain is not null and prochain <= today_ch() + 7;
  -- contrats et avenants à signer
  res := res || coalesce((select jsonb_agg(jsonb_build_object('id', 'signer:' || d.id, 'kind', 'signer', 'n', 1, 'urgent', true, 'tab', 'documents',
      'detail', d.title) order by d.uploaded_at) from hr_document d where d.member_id = m.id and d.requires_signature and d.signed_at is null), '[]');
  -- documents de l'employeur pas encore ouverts (fiches de salaire, certificats…)
  select count(*) into n from hr_document d where d.member_id = m.id and d.seen_at is null and not (d.requires_signature and d.signed_at is null);
  if n > 0 then res := res || jsonb_build_object('id', 'documents', 'kind', 'documents', 'n', n, 'urgent', false, 'tab', 'documents'); end if;
  -- nouveaux événements au planning
  select count(*), min(e.start_date) into n, prochain from event e join event_member em on em.event_id = e.id
    where em.member_id = m.id and e.end_date >= today_ch() and not exists (select 1 from member_seen s where s.member_id = m.id and s.key = 'event:' || e.id);
  if n > 0 then res := res || jsonb_build_object('id', 'planning', 'kind', 'planning', 'n', n, 'urgent', prochain <= today_ch() + 2, 'tab', 'planning'); end if;
  -- fiche personnelle incomplète (nécessaire au contrat et au salaire)
  n := profil_manquant(m.id);
  if n > 0 then res := res || jsonb_build_object('id', 'profil', 'kind', 'profil', 'n', 1, 'missing', n, 'urgent', soon, 'tab', 'profil'); end if;
  -- notice de protection des données (nouvelle version à relire)
  if m.privacy_ack_at is null or coalesce(m.privacy_version, '') < privacy_current() then
    res := res || jsonb_build_object('id', 'notice', 'kind', 'notice', 'n', 1, 'urgent', false, 'tab', 'profil');
  end if;
  -- formation hygiène (faite sur la tablette du stand) : urgente avant le premier service
  if not exists (select 1 from training_record t where t.member_id = m.id and t.score = 5) then
    res := res || jsonb_build_object('id', 'formation', 'kind', 'formation', 'n', 1, 'urgent', soon, 'tab', 'profil');
  end if;
  return res;
end $$;

create or replace function nc_ouvertes(c uuid) returns int language sql stable as $$
  select count(*)::int from nonconformity n where n.company_id = c
    and not exists (select 1 from nc_step s where s.nc_id = n.id and s.step = 'cloture');
$$;

-- Nombre affiché sur l'icône de l'app : ses propres tâches + incidents ouverts (si la personne les traite)
create or replace function badge_total(p_member uuid) returns int language sql stable security definer as $$
  select coalesce((select sum((x->>'n')::int) from jsonb_array_elements(a_faire(p_member)) x), 0)::int
    + case when is_direction(p_member) and has_right(p_member, 'traiter_nc') then nc_ouvertes((select company_id from member where id = p_member)) else 0 end;
$$;

-- ---------------------------------------------------------------- app de la personne
create or replace function rpc_mes_a_faire() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  return jsonb_build_object('items', a_faire(m.id), 'badge', badge_total(m.id),
    'nc', case when is_direction(m.id) and has_right(m.id, 'traiter_nc') then nc_ouvertes(m.company_id) else 0 end);
end $$;

create or replace function rpc_planning_vu() returns void language plpgsql security definer as $$
declare m member;
begin
  m := employee_member();
  insert into member_seen(member_id, key) select m.id, 'event:' || e.id from event e join event_member em on em.event_id = e.id
    where em.member_id = m.id and e.end_date >= today_ch() - 60 on conflict do nothing;
end $$;

-- Notice lue sur son téléphone (même effet que sur la tablette)
create or replace function rpc_ma_notice_lue(p_version text) returns void language plpgsql security definer as $$
declare m member;
begin
  m := employee_member();
  if p_version is distinct from privacy_current() then raise exception 'Notice périmée : rechargez l’app'; end if;
  update member set privacy_ack_at = now(), privacy_version = p_version where id = m.id;
end $$;

-- Notifications : tout compte relié peut abonner son téléphone (avant : Direction seulement)
create or replace function rpc_push_abonner(p_endpoint text, p_p256dh text, p_auth text) returns void language plpgsql security definer as $$
declare m member;
begin
  m := employee_member();
  if m.auth_user_id is null then raise exception 'Accès refusé'; end if;
  if p_endpoint not like 'https://%' then raise exception 'Abonnement invalide'; end if;
  insert into push_subscription(member_id, endpoint, p256dh, auth) values (m.id, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- ---------------------------------------------------------------- envoi (fonction serveur « notifications »)
-- Abonnements d'une personne, avec le nombre à afficher sur l'icône
create or replace function push_abonnes(p_member uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'badge', badge_total(m.id))), '[]')
  from push_subscription s join member m on m.id = s.member_id
  where m.id = p_member and m.active and m.auth_user_id is not null;
$$;

-- Direction (migration 006) : même liste, avec le nombre pour l'icône
create or replace function push_destinataires(c uuid, p_right right_code) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'badge', badge_total(m.id))), '[]')
  from push_subscription s join member m on m.id = s.member_id
  where m.company_id = c and m.active and m.auth_user_id is not null and is_direction(m.id) and has_right(m.id, p_right);
$$;

create or replace function push_perso(p_now timestamptz) returns jsonb language plpgsql security definer as $$
declare res jsonb := '[]'; r record; k text; h int := extract(hour from p_now at time zone 'Europe/Zurich'); jour date := local_day(p_now); n int;
begin
  -- document déposé par le Gérant : contrat à signer (urgent), fiche de salaire, autre
  for r in select d.*, m.lang from hr_document d join member m on m.id = d.member_id where d.uploaded_at > p_now - interval '30 minutes' loop
    k := 'rhnew:' || r.id;
    continue when exists (select 1 from push_sent where key = k);
    res := res || jsonb_build_object('key', k, 'urgent', r.requires_signature, 'url', '/?onglet=documents', 'to', push_abonnes(r.member_id),
      'title', case when r.requires_signature then '🔴 ' || tr3(r.lang, 'Contrat à signer', 'Contrato por firmar', 'Contract to sign')
                    when r.kind = 'fiche_salaire' then tr3(r.lang, 'Nouvelle fiche de salaire', 'Nueva nómina', 'New payslip')
                    else tr3(r.lang, 'Nouveau document', 'Nuevo documento', 'New document') end,
      'body', r.title || ' · ' || tr3(r.lang, 'ouvrir dans NORMA', 'abrir en NORMA', 'open in NORMA'));
  end loop;
  -- rappel : contrat toujours pas signé après 1, 2 et 3 jours (entre 8 h et 20 h)
  if h between 8 and 19 then
    for r in select d.*, m.lang, g.n from hr_document d join member m on m.id = d.member_id, generate_series(1, 3) g(n)
             where d.requires_signature and d.signed_at is null and m.active
               and p_now - d.uploaded_at between make_interval(days => g.n) and make_interval(days => g.n, hours => 12) loop
      k := 'rhrappel:' || r.id || ':' || r.n;
      continue when exists (select 1 from push_sent where key = k);
      res := res || jsonb_build_object('key', k, 'urgent', true, 'url', '/?onglet=documents', 'to', push_abonnes(r.member_id),
        'title', '🔴 ' || tr3(r.lang, 'Rappel : contrat à signer', 'Recordatorio: contrato por firmar', 'Reminder: contract to sign'), 'body', r.title);
    end loop;
  end if;
  -- nouvel événement au planning (une seule notification par personne et par événement)
  for r in select e.id, e.name, e.place, e.start_date, m.id as mid, m.lang from event e join event_member em on em.event_id = e.id join member m on m.id = em.member_id
           where e.end_date >= jour and m.active and m.auth_user_id is not null
             and not exists (select 1 from member_seen s where s.member_id = m.id and s.key in ('event:' || e.id, 'push:event:' || e.id)) loop
    insert into member_seen(member_id, key) values (r.mid, 'push:event:' || r.id) on conflict do nothing;
    res := res || jsonb_build_object('key', 'plan:' || r.id || ':' || r.mid, 'urgent', r.start_date <= jour + 2, 'url', '/?onglet=planning', 'to', push_abonnes(r.mid),
      'title', case when r.start_date <= jour + 2 then '🔴 ' else '' end || tr3(r.lang, 'Nouveau au planning', 'Nuevo en tu planificación', 'New on your schedule'),
      'body', r.name || ' · ' || to_char(r.start_date, 'DD.MM.YYYY') || coalesce(nullif(' · ' || r.place, ' · '), ''));
  end loop;
  -- veille d'un événement (dès 18 h) : rappel, avec ce qui reste à faire
  if h between 18 and 20 then
    for r in select e.id, e.name, e.place, m.id as mid, m.lang from event e join event_member em on em.event_id = e.id join member m on m.id = em.member_id
             where e.start_date = jour + 1 and m.active and m.auth_user_id is not null loop
      k := 'veille:' || r.id || ':' || r.mid;
      continue when exists (select 1 from push_sent where key = k);
      n := (select count(*) from jsonb_array_elements(a_faire(r.mid)) x where (x->>'urgent')::boolean);
      res := res || jsonb_build_object('key', k, 'urgent', n > 0, 'url', '/', 'to', push_abonnes(r.mid),
        'title', tr3(r.lang, 'Demain : ', 'Mañana: ', 'Tomorrow: ') || r.name,
        'body', coalesce(nullif(r.place, '') || ' · ', '') || case when n > 0
          then '🔴 ' || tr3(r.lang, n || ' chose(s) à faire avant', n || ' cosa(s) por hacer antes', n || ' thing(s) to do before')
          else tr3(r.lang, 'tout est prêt', 'todo listo', 'all set') end);
    end loop;
  end if;
  -- Gérant : document déposé par une personne (pièce d'identité, AVS, IBAN…)
  for r in select d.*, m.first_name from member_doc d join member m on m.id = d.member_id where d.at > p_now - interval '30 minutes' loop
    k := 'mdoc:' || r.id;
    continue when exists (select 1 from push_sent where key = k);
    res := res || jsonb_build_object('key', k, 'urgent', false, 'url', '/', 'to', push_destinataires(r.company_id, 'reglages_gerant'),
      'title', 'Nouveau document reçu', 'body', r.first_name || ' · ' || r.filename);
  end loop;
  return res;
end $$;

do $$
declare src text;
begin
  -- ajoute les notifications personnelles à l'envoi existant (push_a_envoyer, migrations 006 et 009)
  select pg_get_functiondef('norma.push_a_envoyer(timestamptz)'::regprocedure) into src;
  if position('push_perso(' in src) = 0 then
    src := replace(src, '  insert into push_sent(key) select x->>''key'' from jsonb_array_elements(res) x on conflict do nothing;',
      '  res := res || push_perso(p_now);' || chr(10) || '  insert into push_sent(key) select x->>''key'' from jsonb_array_elements(res) x on conflict do nothing;');
    execute src;
  end if;
end $$;

-- Événements déjà affectés avant cette mise à jour : pas de notification rétroactive
insert into member_seen(member_id, key) select em.member_id, 'push:event:' || em.event_id from event_member em on conflict do nothing;

-- ================================================================ droits et chemin de recherche
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname in ('tr3','profil_manquant','a_faire','nc_ouvertes','badge_total','rpc_mes_a_faire',
             'rpc_planning_vu','rpc_ma_notice_lue','rpc_push_abonner','push_abonnes','push_destinataires','push_perso','push_a_envoyer') loop
    execute format('alter function %s set search_path = norma, pg_catalog, public, extensions', f.sig);
    execute format('alter function %s set timezone = %L', f.sig, 'Europe/Zurich');
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function norma.push_a_envoyer(timestamptz) to service_role';
  end if;
end $$;
grant execute on function rpc_mes_a_faire(), rpc_planning_vu(), rpc_ma_notice_lue(text), rpc_push_abonner(text, text, text) to authenticated;
