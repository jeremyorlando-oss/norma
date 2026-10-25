-- NORMA 008 — informations personnelles de chaque membre (dossier du personnel) + CV et certificats.
-- Chacun saisit ses propres données ; la Direction les consulte.
-- Données de salaire (AVS, IBAN, date de naissance, état civil, enfants, permis) : Gérant seul ; le Manager voit le contact et la personne à prévenir.
set search_path = norma, public, extensions;

create table member_profile (
  member_id uuid primary key references member(id),
  company_id uuid not null references company(id),
  legal_first_names text not null default '',     -- prénoms complets (comme sur la pièce d'identité)
  legal_last_name text not null default '',       -- nom complet
  avs text not null default '',                   -- 756.XXXX.XXXX.XX
  email text not null default '',
  phone text not null default '',
  street text not null default '',
  npa text not null default '',
  city text not null default '',
  country text not null default 'Suisse',
  -- contrat, salaire, assurances sociales, impôt à la source (Gérant seul)
  birth_date date,
  nationality text not null default '',
  permit text not null default '' check (permit in ('', 'CH', 'B', 'C', 'L', 'G', 'Ci', 'F', 'N', 'S', 'autre')),
  permit_until date,
  civil_status text not null default '' check (civil_status in ('', 'celibataire', 'marie', 'partenariat', 'separe', 'divorce', 'veuf')),
  children int check (children between 0 and 20),
  iban text not null default '',
  iban_holder text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  updated_at timestamptz not null default now()
);
alter table member_profile enable row level security;

-- Numéro AVS suisse : 756.XXXX.XXXX.XX avec chiffre de contrôle EAN-13
create or replace function avs_valide(p text) returns boolean language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int := 0; i int;
begin
  if p !~ '^756\.\d{4}\.\d{4}\.\d{2}$' then return false; end if;
  for i in 1 .. 12 loop s := s + substr(d, i, 1)::int * case when i % 2 = 0 then 3 else 1 end; end loop;
  return (10 - s % 10) % 10 = substr(d, 13, 1)::int;
end $$;

-- IBAN : contrôle modulo 97 (ISO 13616)
create or replace function iban_valide(p text) returns boolean language plpgsql immutable as $$
declare x text := upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')); r text; n text := ''; i int; c text; m bigint := 0;
begin
  if x !~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$' then return false; end if;
  r := substr(x, 5) || substr(x, 1, 4);
  for i in 1 .. length(r) loop
    c := substr(r, i, 1);
    n := n || case when c ~ '\d' then c else (ascii(c) - 55)::text end;
  end loop;
  for i in 1 .. length(n) loop m := (m * 10 + substr(n, i, 1)::int) % 97; end loop;
  return m = 1;
end $$;

create or replace function profile_json(m member, p member_profile, p_full boolean) returns jsonb language sql stable as $$
  select jsonb_build_object('memberId', m.id,
    'prenoms', coalesce(nullif(p.legal_first_names, ''), m.first_name), 'nom', coalesce(nullif(p.legal_last_name, ''), m.last_name),
    'email', coalesce(p.email, ''), 'phone', coalesce(p.phone, ''), 'street', coalesce(p.street, ''), 'npa', coalesce(p.npa, ''),
    'city', coalesce(p.city, ''), 'country', coalesce(p.country, 'Suisse'),
    'emergencyName', coalesce(p.emergency_name, ''), 'emergencyPhone', coalesce(p.emergency_phone, ''), 'updatedAt', p.updated_at)
  || case when p_full then jsonb_build_object('full', true, 'avs', coalesce(p.avs, ''), 'birthDate', p.birth_date, 'nationality', coalesce(p.nationality, ''),
       'permit', coalesce(p.permit, ''), 'permitUntil', p.permit_until, 'civilStatus', coalesce(p.civil_status, ''), 'children', p.children,
       'iban', coalesce(p.iban, ''), 'ibanHolder', coalesce(p.iban_holder, ''))
     else jsonb_build_object('full', false) end;
$$;

create or replace function rpc_mon_profil() returns jsonb language plpgsql stable security definer as $$
declare m member; p member_profile;
begin
  m := employee_member();
  select * into p from member_profile where member_id = m.id;
  return profile_json(m, p, true);
end $$;

create or replace function rpc_mon_profil_maj(p jsonb) returns jsonb language plpgsql security definer as $$
declare m member; r member_profile; k text; v text;
begin
  m := employee_member();
  foreach k in array array['prenoms','nom','avs','email','phone','street','npa','city','country','nationality','iban','ibanHolder','emergencyName','emergencyPhone'] loop
    if length(coalesce(p->>k, '')) > 120 then raise exception 'Texte trop long : %', k; end if;
  end loop;
  if coalesce(p->>'avs', '') <> '' and not avs_valide(p->>'avs') then raise exception 'Numéro AVS invalide (format 756.1234.5678.97)'; end if;
  if coalesce(p->>'email', '') <> '' and (p->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'E-mail invalide'; end if;
  if coalesce(p->>'iban', '') <> '' and not iban_valide(p->>'iban') then raise exception 'IBAN invalide'; end if;
  v := upper(regexp_replace(coalesce(p->>'iban', ''), '\s', '', 'g'));
  insert into member_profile(member_id, company_id, legal_first_names, legal_last_name, avs, email, phone, street, npa, city, country,
    birth_date, nationality, permit, permit_until, civil_status, children, iban, iban_holder, emergency_name, emergency_phone)
  values (m.id, m.company_id, btrim(coalesce(p->>'prenoms', '')), btrim(coalesce(p->>'nom', '')), btrim(coalesce(p->>'avs', '')),
    lower(btrim(coalesce(p->>'email', ''))), btrim(coalesce(p->>'phone', '')), btrim(coalesce(p->>'street', '')), btrim(coalesce(p->>'npa', '')),
    btrim(coalesce(p->>'city', '')), coalesce(nullif(btrim(p->>'country'), ''), 'Suisse'),
    nullif(p->>'birthDate', '')::date, btrim(coalesce(p->>'nationality', '')), coalesce(p->>'permit', ''), nullif(p->>'permitUntil', '')::date,
    coalesce(p->>'civilStatus', ''), nullif(p->>'children', '')::int, v, btrim(coalesce(p->>'ibanHolder', '')),
    btrim(coalesce(p->>'emergencyName', '')), btrim(coalesce(p->>'emergencyPhone', '')))
  on conflict (member_id) do update set legal_first_names = excluded.legal_first_names, legal_last_name = excluded.legal_last_name,
    avs = excluded.avs, email = excluded.email, phone = excluded.phone, street = excluded.street, npa = excluded.npa,
    city = excluded.city, country = excluded.country, birth_date = excluded.birth_date, nationality = excluded.nationality,
    permit = excluded.permit, permit_until = excluded.permit_until, civil_status = excluded.civil_status, children = excluded.children,
    iban = excluded.iban, iban_holder = excluded.iban_holder, emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
    updated_at = now()
  returning * into r;
  return profile_json(m, r, true);
end $$;

-- Direction : fiche d'un membre (données de salaire : Gérant seulement)
create or replace function rpc_profil_membre(p_member uuid) returns jsonb language plpgsql stable security definer as $$
declare d member; m member; p member_profile;
begin
  d := iphone_member();
  perform need(d.id, 'gestion_equipe', 'Gestion de l’équipe non autorisée');
  select * into m from member where id = p_member and company_id = d.company_id;
  if m.id is null then raise exception 'Membre inconnu'; end if;
  select * into p from member_profile where member_id = m.id;
  return profile_json(m, p, has_right(d.id, 'reglages_gerant'));
end $$;

-- Documents : CV et certificats (de travail, diplômes) en plus
alter table member_doc drop constraint member_doc_kind_check;
alter table member_doc add constraint member_doc_kind_check
  check (kind in ('identite','avs','bancaire','certificat_medical','cv','certificat','autre'));
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/heic','image/heif','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    where id = 'documents-employes';
  end if;
end $$;

-- Notice de protection des données complétée (dossier du personnel) : à relire
create or replace function privacy_current() returns text language sql immutable as $$ select '2026-10-25b' $$;

-- ================================================================ droits et chemin de recherche
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname in ('privacy_current','avs_valide','iban_valide','profile_json','rpc_mon_profil','rpc_mon_profil_maj','rpc_profil_membre') loop
    execute format('alter function %s set search_path = norma, pg_catalog, public, extensions', f.sig);
    execute format('alter function %s set timezone = %L', f.sig, 'Europe/Zurich');
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;
grant execute on function rpc_mon_profil(), rpc_mon_profil_maj(jsonb), rpc_profil_membre(uuid) to authenticated;
