-- NORMA 006 — espace Employé (V1.1, D30/D38/D39), rapport du soir par e-mail (D31), notifications iPhone, mode hors ligne.
-- À coller UNE FOIS dans le SQL Editor de Supabase, après 005.
set search_path = norma, public, extensions;

-- Émulation locale (tests) : sur Supabase, auth.users existe déjà
do $$ begin
  if to_regclass('auth.users') is null then create table auth.users (id uuid primary key, email text); end if;
end $$;

-- ================================================================ comptes : Direction, tablette, employé
-- Direction = Gérant, ou membre ayant le tableau de bord ET la gestion de l'équipe (Manager)
create or replace function is_direction(p_member uuid) returns boolean language sql stable security definer as $$
  select coalesce(has_right(p_member, 'tableau_bord') and has_right(p_member, 'gestion_equipe'), false);
$$;

-- Les données de l'entreprise ne sont lisibles que par la tablette et la Direction.
-- Un compte Employé ne voit que ses propres données, par les fonctions rpc_mes_* ci-dessous.
create or replace function my_company() returns uuid language sql stable security definer as $$
  select company_id from member m where m.auth_user_id = auth.uid() and m.active and is_direction(m.id)
  union all select company_id from device where auth_user_id = auth.uid() and active
  limit 1;
$$;

create or replace function employee_member() returns member language plpgsql stable security definer as $$
declare m member;
begin
  select * into m from member where auth_user_id = auth.uid() and active;
  if m.id is null then raise exception 'Accès refusé'; end if;
  return m;
end $$;

-- ================================================================ invitations par WhatsApp (lien à usage unique, 48 h)
create table invitation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  token_hash bytea not null unique,          -- seul le hachage est gardé : le lien n'est connu que de la personne invitée
  created_by uuid not null references member(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table invitation enable row level security;

create or replace function rpc_inviter(p_member uuid) returns text language plpgsql security definer as $$
declare m member; t member; tok text;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  select * into t from member where id = p_member and company_id = m.company_id and active;
  if t.id is null then raise exception 'Membre inconnu'; end if;
  if t.auth_user_id is not null then raise exception '% a déjà un compte', t.first_name; end if;
  if is_direction(t.id) and not has_right(m.id, 'reglages_gerant') then raise exception 'Seul le Gérant peut inviter un Manager'; end if;
  update invitation set expires_at = now() where member_id = t.id and used_at is null and expires_at > now();
  tok := encode(gen_random_bytes(24), 'hex');
  insert into invitation(company_id, member_id, token_hash, created_by, expires_at)
    values (m.company_id, t.id, digest(tok, 'sha256'), m.id, now() + interval '48 hours');
  insert into access_log(company_id, who, action) values (m.company_id, m.first_name, 'Invitation envoyée à ' || t.first_name);
  return tok;
end $$;

-- Utilisées seulement par la fonction serveur « invitation » (clé secrète), jamais par l'app
create or replace function invitation_valide(p_token text) returns jsonb language sql stable security definer as $$
  select jsonb_build_object('prenom', m.first_name, 'langue', m.lang, 'entreprise', c.name)
  from invitation i join member m on m.id = i.member_id join company c on c.id = m.company_id
  where i.token_hash = digest(p_token, 'sha256') and i.used_at is null and i.expires_at > now() and m.active and m.auth_user_id is null;
$$;

create or replace function invitation_utiliser(p_token text, p_user uuid) returns void language plpgsql security definer as $$
declare i invitation;
begin
  select * into i from invitation where token_hash = digest(p_token, 'sha256') and used_at is null and expires_at > now() for update;
  if i.id is null then raise exception 'Invitation invalide ou expirée'; end if;
  update member set auth_user_id = p_user where id = i.member_id and auth_user_id is null and active;
  if not found then raise exception 'Invitation invalide ou expirée'; end if;
  update invitation set used_at = now() where id = i.id;
  insert into access_log(company_id, who, action)
    select i.company_id, first_name, 'Compte Employé créé' from member where id = i.member_id;
end $$;

-- Comptes de l'équipe (pour l'écran Équipe de la Direction)
create or replace function rpc_comptes() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  return coalesce((select jsonb_agg(jsonb_build_object('memberId', x.id, 'langue', x.lang, 'compte', x.auth_user_id is not null,
      'invitationJusqua', (select max(expires_at) from invitation i where i.member_id = x.id and i.used_at is null and i.expires_at > now()),
      'documents', (select count(*) from member_doc d where d.member_id = x.id)))
    from member x where x.company_id = m.company_id and x.active), '[]');
end $$;

create or replace function rpc_retirer_acces(p_member uuid) returns void language plpgsql security definer as $$
declare m member; t member;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  select * into t from member where id = p_member and company_id = m.company_id;
  if t.id is null then raise exception 'Membre inconnu'; end if;
  if t.id = m.id then raise exception 'Impossible de retirer votre propre accès'; end if;
  if is_direction(t.id) and not has_right(m.id, 'reglages_gerant') then raise exception 'Seul le Gérant peut retirer l’accès d’un Manager'; end if;
  update member set auth_user_id = null where id = t.id;
  insert into access_log(company_id, who, action) values (m.company_id, m.first_name, 'Accès téléphone retiré à ' || t.first_name);
end $$;

-- ================================================================ documents déposés par l'employé
create table member_doc (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  kind text not null check (kind in ('identite','avs','bancaire','certificat_medical','autre')),
  path text not null unique,
  filename text not null,
  at timestamptz not null default now()
);
alter table member_doc enable row level security;
create trigger member_doc_no_update before update on member_doc for each row execute function forbid_change();

create or replace function doc_json(d member_doc) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'kind', d.kind, 'path', d.path, 'filename', d.filename, 'at', d.at);
$$;

create or replace function rpc_document_ajoute(p_kind text, p_path text, p_filename text) returns jsonb language plpgsql security definer as $$
declare m member; d member_doc;
begin
  m := employee_member();
  if p_path not like m.company_id || '/' || m.id || '/' || p_kind || '/%' then raise exception 'Emplacement du fichier refusé'; end if;
  insert into member_doc(company_id, member_id, kind, path, filename) values (m.company_id, m.id, p_kind, p_path, left(p_filename, 120))
    returning * into d;
  return doc_json(d);
end $$;

create or replace function rpc_mes_documents() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  return coalesce((select jsonb_agg(doc_json(d) order by d.at desc) from member_doc d where d.member_id = m.id), '[]');
end $$;

-- Certificats médicaux : Gérant seul (D30)
create or replace function rpc_documents_membre(p_member uuid) returns jsonb language plpgsql stable security definer as $$
declare m member; owner boolean;
begin
  m := iphone_member();
  perform need(m.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  owner := has_right(m.id, 'reglages_gerant');
  return coalesce((select jsonb_agg(doc_json(d) order by d.at desc) from member_doc d
    where d.member_id = p_member and d.company_id = m.company_id and (owner or d.kind <> 'certificat_medical')), '[]');
end $$;

-- Suppression (droit à l'effacement, fin d'emploi) : Gérant seul ; le fichier est retiré par l'app juste avant
create or replace function rpc_document_supprimer(p_id uuid) returns void language plpgsql security definer as $$
declare m member; d member_doc;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Seul le Gérant peut supprimer un document');
  delete from member_doc where id = p_id and company_id = m.company_id returning * into d;
  if d.id is null then raise exception 'Document inconnu'; end if;
  insert into access_log(company_id, who, action) values (m.company_id, m.first_name, 'Document supprimé : ' || d.filename);
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      values ('documents-employes', 'documents-employes', false, 10485760, array['image/jpeg','image/png','image/heic','image/heif','application/pdf'])
      on conflict (id) do nothing;
    -- l'employé dépose et relit ses fichiers : <entreprise>/<membre>/<type>/<fichier>
    execute $p$create policy norma_docs_depot on storage.objects for insert to authenticated
      with check (bucket_id = 'documents-employes' and (storage.foldername(name))[1] = (select company_id::text from norma.member where id = norma.my_member())
                  and (storage.foldername(name))[2] = norma.my_member()::text)$p$;
    execute $p$create policy norma_docs_lecture on storage.objects for select to authenticated
      using (bucket_id = 'documents-employes' and (
        (storage.foldername(name))[2] = norma.my_member()::text
        or ((storage.foldername(name))[1] = norma.my_company()::text and norma.has_right(norma.my_member(), 'gestion_equipe')
            and ((storage.foldername(name))[3] <> 'certificat_medical' or norma.has_right(norma.my_member(), 'reglages_gerant')))))$p$;
    execute $p$create policy norma_docs_suppression on storage.objects for delete to authenticated
      using (bucket_id = 'documents-employes' and (storage.foldername(name))[1] = norma.my_company()::text
             and norma.has_right(norma.my_member(), 'reglages_gerant'))$p$;
  end if;
end $$;

-- ================================================================ espace Employé : ses propres données
create or replace function rpc_employe_moi() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  return (select jsonb_build_object('memberId', m.id, 'companyId', m.company_id, 'prenom', m.first_name, 'nom', m.last_name, 'langue', m.lang, 'poste', p.name,
      'entreprise', c.name, 'privacyAck', m.privacy_ack_at, 'privacyVersion', m.privacy_version,
      'formations', coalesce((select jsonb_agg(jsonb_build_object('score', t.score, 'at', t.at) order by t.at desc) from training_record t where t.member_id = m.id), '[]'))
    from poste p, company c where p.id = m.poste_id and c.id = m.company_id);
end $$;

create or replace function rpc_mes_heures(p_from timestamptz, p_to timestamptz) returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  if p_to - p_from > interval '400 days' then raise exception 'Période trop longue'; end if;
  return coalesce((select jsonb_agg(s) from jsonb_array_elements(shifts_json(m.company_id, p_from, p_to)) s
    where s->>'memberId' = m.id::text), '[]');
end $$;

-- Planning : événements auxquels la personne est affectée (sans les notes internes)
create or replace function rpc_mon_planning() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'place', e.place, 'start', e.start_date, 'end', e.end_date)
      order by e.start_date)
    from event e join event_member em on em.event_id = e.id
    where em.member_id = m.id and e.end_date >= today_ch() - 60), '[]');
end $$;

create or replace function rpc_ma_langue(p_lang text) returns void language plpgsql security definer as $$
declare m member;
begin
  m := employee_member();
  if p_lang not in ('fr','es','en') then raise exception 'Langue inconnue'; end if;
  update member set lang = p_lang where id = m.id;
end $$;

-- ================================================================ notice de protection des données : nouvelle version à relire
-- Version en vigueur (= PRIVACY_VERSION dans app/src/domain/privacy.ts). Une notice plus ancienne doit être relue.
create or replace function privacy_current() returns text language sql immutable as $$ select '2026-10-25' $$;
create or replace function session_json(p_member uuid, p_token uuid, p_arrivee boolean) returns jsonb language sql stable as $$
  select jsonb_build_object('token', p_token, 'memberId', m.id, 'langue', m.lang, 'prenom', m.first_name, 'poste', p.name,
    'arrivee', p_arrivee, 'droits', to_jsonb(droits_de(m.id)), 'aptToday', is_fit_today(m.id),
    'privacyAck', m.privacy_ack_at is not null and coalesce(m.privacy_version, '') >= privacy_current(), 'onBreak', on_break(m.id),
    'trained', exists (select 1 from training_record t where t.member_id = m.id and t.score = 5))
  from member m join poste p on p.id = m.poste_id where m.id = p_member;
$$;

-- ================================================================ tâches automatiques (fonctions serveur appelées par pg_cron)
-- Secret partagé entre pg_cron et les fonctions serveur : généré ici, jamais affiché ni copié à la main
create table cron_secret (id int primary key default 1 check (id = 1), secret text not null default encode(gen_random_bytes(32), 'hex'));
insert into cron_secret default values on conflict do nothing;
alter table cron_secret enable row level security;

create or replace function cron_verifier(p_secret text) returns boolean language sql stable security definer as $$
  select exists (select 1 from cron_secret where secret = p_secret);
$$;

-- ================================================================ rapport du soir par e-mail (D31)
-- Le rapport de la veille part chaque matin à l'heure choisie (6 h par défaut), au Gérant et aux Managers.
alter table company add column report_hour int not null default 6 check (report_hour between 0 and 23);
create table report_mail (
  company_id uuid not null references company(id),
  day date not null,
  sent_at timestamptz not null default now(),
  recipients int not null,
  primary key (company_id, day)
);
alter table report_mail enable row level security;

create or replace function direction_emails(c uuid) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(u.email), '[]') from member m join auth.users u on u.id = m.auth_user_id
  where m.company_id = c and m.active and is_direction(m.id) and has_right(m.id, 'export');
$$;

create or replace function rapports_a_envoyer(p_now timestamptz) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('companyId', c.id, 'entreprise', c.name, 'day', local_day(p_now) - 1,
      'to', direction_emails(c.id), 'report', report_json(c.id, local_day(p_now) - 1))), '[]')
  from company c
  where extract(hour from p_now at time zone 'Europe/Zurich') >= c.report_hour
    and not exists (select 1 from report_mail r where r.company_id = c.id and r.day = local_day(p_now) - 1)
    and stand_opened(c.id, local_day(p_now) - 1) is not null;
$$;

create or replace function rapport_envoye(p_company uuid, p_day date, p_n int) returns void language sql security definer as $$
  insert into report_mail(company_id, day, recipients) values (p_company, p_day, p_n) on conflict do nothing;
$$;

create or replace function rpc_heure_rapport(p_hour int) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  perform need(m.id, 'reglages_gerant', 'Réservé au Gérant');
  update company set report_hour = p_hour where id = m.company_id;
end $$;

create or replace function rpc_rapports_envoyes() returns jsonb language sql stable security definer as $$
  select jsonb_build_object('hour', (select report_hour from company where id = my_company()),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'at', sent_at, 'to', recipients) order by day desc)
      from (select * from report_mail where company_id = my_company() order by day desc limit 14) r), '[]'));
$$;

-- ================================================================ notifications iPhone (Web Push)
create table push_keys (id int primary key default 1 check (id = 1), public_key text not null, private_jwk jsonb not null);
create table push_subscription (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table push_sent (key text primary key, at timestamptz not null default now());
alter table push_keys enable row level security;
alter table push_subscription enable row level security;
alter table push_sent enable row level security;

create or replace function rpc_push_cle() returns text language sql stable security definer as $$
  select public_key from push_keys where id = 1;
$$;

create or replace function rpc_push_abonner(p_endpoint text, p_p256dh text, p_auth text) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  if not is_direction(m.id) then raise exception 'Notifications réservées à la Direction'; end if;
  if p_endpoint not like 'https://%' then raise exception 'Abonnement invalide'; end if;
  insert into push_subscription(member_id, endpoint, p256dh, auth) values (m.id, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function rpc_push_desabonner(p_endpoint text) returns void language plpgsql security definer as $$
declare m member;
begin
  m := iphone_member();
  delete from push_subscription where endpoint = p_endpoint and member_id = m.id;
end $$;

create or replace function rpc_push_actif() returns boolean language sql stable security definer as $$
  select exists (select 1 from push_subscription where member_id = my_member());
$$;

-- Fonctions serveur (clé secrète)
create or replace function push_cles_enregistrer(p_public text, p_private jsonb) returns text language sql security definer as $$
  insert into push_keys(id, public_key, private_jwk) values (1, p_public, p_private) on conflict (id) do nothing;
  select public_key from push_keys where id = 1;
$$;
create or replace function push_cles() returns jsonb language sql stable security definer as $$
  select jsonb_build_object('publicKey', public_key, 'privateJwk', private_jwk) from push_keys where id = 1;
$$;
create or replace function push_supprimer(p_endpoint text) returns void language sql security definer as $$
  delete from push_subscription where endpoint = p_endpoint;
$$;

-- Abonnements des personnes de la Direction ayant le droit concerné (notify/rules.ts)
create or replace function push_destinataires(c uuid, p_right right_code) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]')
  from push_subscription s join member m on m.id = s.member_id
  where m.company_id = c and m.active and m.auth_user_id is not null and is_direction(m.id) and has_right(m.id, p_right);
$$;

-- Notifications à envoyer maintenant ; chacune n'est envoyée qu'une fois (clé enregistrée dans push_sent)
create or replace function push_a_envoyer(p_now timestamptz) returns jsonb language plpgsql security definer as $$
declare res jsonb := '[]'; r record; k text; c record; o timestamptz;
begin
  -- incidents, températures hors seuil, coupures de courant (ouverts dans les 30 dernières minutes)
  for r in select n.*, m.first_name from nonconformity n join member m on m.id = n.opened_by
           where n.opened_at > p_now - interval '30 minutes' loop
    k := 'nc:' || r.id;
    continue when exists (select 1 from push_sent where key = k);
    res := res || jsonb_build_object('key', k,
      'title', case r.kind when 'temperature' then 'Température hors seuil' when 'coupure_courant' then 'Coupure de courant sur le stand' else 'Nouvel incident signalé' end,
      'body', r.first_name || ' · ' || left(r.description, 140), 'urgent', true,
      'to', push_destinataires(r.company_id, 'traiter_nc'));
  end loop;
  -- oubli de dépointage : service ouvert depuis plus de 10 h
  for c in select id from company loop
    for r in select s from jsonb_array_elements(shifts_json(c.id, p_now - interval '2 days', p_now)) s
             where s->>'end' is null and p_now - (s->>'start')::timestamptz > interval '10 hours' loop
      k := 'shift:' || (r.s->>'id');
      continue when exists (select 1 from push_sent where key = k);
      res := res || jsonb_build_object('key', k, 'title', 'Oubli de dépointage ?',
        'body', (r.s->>'prenom') || ' est pointé depuis plus de 10 h', 'urgent', false, 'to', push_destinataires(c.id, 'heures_equipe'));
    end loop;
    -- nettoyage en retard de plus de 30 min
    o := stand_opened(c.id, local_day(p_now));
    if o is not null then
      for r in select i.id, i.name, greatest(coalesce((select max(at) from cleaning_done where item_id = i.id), o), o) + make_interval(mins => i.interval_minutes) as due
               from cleaning_item i where i.company_id = c.id and i.active and i.frequency = 'intervalle' loop
        continue when p_now - r.due < interval '30 minutes';
        k := 'clean:' || r.id || ':' || extract(epoch from r.due)::bigint;
        continue when exists (select 1 from push_sent where key = k);
        res := res || jsonb_build_object('key', k, 'title', 'Nettoyage en retard de plus de 30 min',
          'body', r.name, 'urgent', false, 'to', push_destinataires(c.id, 'tableau_bord'));
      end loop;
    end if;
    -- rapport du jour envoyé par e-mail
    for r in select * from report_mail where company_id = c.id and sent_at > p_now - interval '30 minutes' loop
      k := 'rapport:' || c.id || ':' || r.day;
      continue when exists (select 1 from push_sent where key = k);
      res := res || jsonb_build_object('key', k, 'title', 'Rapport HACCP du ' || to_char(r.day, 'DD.MM.YYYY'),
        'body', 'Envoyé par e-mail : à imprimer pour le classeur', 'urgent', false, 'to', push_destinataires(c.id, 'export'));
    end loop;
  end loop;
  insert into push_sent(key) select x->>'key' from jsonb_array_elements(res) x on conflict do nothing;
  delete from push_sent where at < p_now - interval '30 days';
  return res;
end $$;

-- ================================================================ sécurité et droits
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
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname like 'rpc\_%' loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  -- fonctions serveur : seulement la clé secrète (rôle service_role)
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema norma to service_role';
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'norma' and p.proname in ('invitation_valide','invitation_utiliser','cron_verifier','rapports_a_envoyer',
               'rapport_envoye','push_cles_enregistrer','push_cles','push_supprimer','push_a_envoyer') loop
      execute format('grant execute on function %s to service_role', f.sig);
    end loop;
  end if;
end $$;
grant execute on function my_company(), my_member(), has_right(uuid, right_code), today_ch() to authenticated;
