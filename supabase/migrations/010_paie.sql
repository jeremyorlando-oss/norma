-- NORMA 010 — contrats générés et fiches de salaire calculées (Gérant seul).
-- Taux horaire par poste ; réglages de paie de l'entreprise (taux des assurances) ; contrats et fiches enregistrés.
-- Le calcul est fait dans l'app (src/rh/paie.ts, testé) ; la base garde le résultat et le PDF (documents RH, migration 009).
set search_path = norma, public, extensions;

alter table poste add column hourly_rate numeric(6,2) check (hourly_rate between 0 and 500);

create table payroll_settings (
  company_id uuid primary key references company(id),
  vac_pct numeric(5,2) not null default 8.33,
  vac_young_pct numeric(5,2) not null default 10.64,
  holidays_pct numeric(5,2) not null default 0,
  thirteenth_pct numeric(5,2) not null default 8.33,
  avs_pct numeric(5,2) not null default 5.3,
  ac_pct numeric(5,2) not null default 1.1,
  ac_ceiling_year numeric(10,2) not null default 148200,
  aanp_pct numeric(5,2),                         -- taux de l'assureur accident (part salarié), à saisir
  ijm_pct numeric(5,2) not null default 0,
  lpp_pct numeric(5,2) not null default 0,
  pay_day int not null default 30 check (pay_day between 1 and 31),
  updated_at timestamptz not null default now()
);
alter table payroll_settings enable row level security;

alter table member_profile add column source_tax_pct numeric(5,2), add column avs_on_request boolean not null default false;

create table employment_contract (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  poste text not null,
  fonction text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  hourly_rate numeric(6,2) not null check (hourly_rate > 0),
  hr_document_id uuid references hr_document(id) on delete set null,
  created_by uuid not null references member(id),
  created_at timestamptz not null default now()
);
alter table employment_contract enable row level security;

create table payslip (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  month date not null,                           -- 1er du mois
  hours numeric(7,2) not null,
  hourly_rate numeric(6,2) not null,
  gross numeric(10,2) not null,
  avs_base numeric(10,2) not null,
  ac_base numeric(10,2) not null,
  net numeric(10,2) not null,
  data jsonb not null,                           -- détail complet (lignes, notes) tel qu'imprimé
  hr_document_id uuid references hr_document(id) on delete set null,
  created_by uuid not null references member(id),
  created_at timestamptz not null default now(),
  unique (member_id, month)
);
alter table payslip enable row level security;

create or replace function gerant() returns member language plpgsql stable security definer as $$
declare g member;
begin
  g := iphone_member();
  perform need(g.id, 'reglages_gerant', 'Contrats et salaires : réservé au Gérant');
  return g;
end $$;

-- ---------------------------------------------------------------- réglages
create or replace function rpc_paie_reglages() returns jsonb language plpgsql stable security definer as $$
declare g member; s payroll_settings;
begin
  g := gerant();
  select * into s from payroll_settings where company_id = g.company_id;
  return jsonb_build_object(
    'vacPct', coalesce(s.vac_pct, 8.33), 'vacYoungPct', coalesce(s.vac_young_pct, 10.64), 'holidaysPct', coalesce(s.holidays_pct, 0),
    'thirteenthPct', coalesce(s.thirteenth_pct, 8.33), 'avsPct', coalesce(s.avs_pct, 5.3), 'acPct', coalesce(s.ac_pct, 1.1),
    'acCeilingYear', coalesce(s.ac_ceiling_year, 148200), 'aanpPct', s.aanp_pct, 'ijmPct', coalesce(s.ijm_pct, 0), 'lppPct', coalesce(s.lpp_pct, 0),
    'payDay', coalesce(s.pay_day, 30),
    'postes', (select coalesce(jsonb_object_agg(name, hourly_rate), '{}') from poste where company_id = g.company_id));
end $$;

create or replace function rpc_paie_reglages_maj(p jsonb) returns void language plpgsql security definer as $$
declare g member; k text;
begin
  g := gerant();
  foreach k in array array['vacPct','vacYoungPct','holidaysPct','thirteenthPct','avsPct','acPct','ijmPct','lppPct'] loop
    if (p->>k)::numeric not between 0 and 30 then raise exception 'Taux hors limites : %', k; end if;
  end loop;
  if p->>'aanpPct' is not null and (p->>'aanpPct')::numeric not between 0 and 10 then raise exception 'Taux AANP hors limites'; end if;
  insert into payroll_settings(company_id, vac_pct, vac_young_pct, holidays_pct, thirteenth_pct, avs_pct, ac_pct, ac_ceiling_year, aanp_pct, ijm_pct, lpp_pct, pay_day)
  values (g.company_id, (p->>'vacPct')::numeric, (p->>'vacYoungPct')::numeric, (p->>'holidaysPct')::numeric, (p->>'thirteenthPct')::numeric,
    (p->>'avsPct')::numeric, (p->>'acPct')::numeric, coalesce((p->>'acCeilingYear')::numeric, 148200), (p->>'aanpPct')::numeric,
    (p->>'ijmPct')::numeric, (p->>'lppPct')::numeric, coalesce((p->>'payDay')::int, 30))
  on conflict (company_id) do update set vac_pct = excluded.vac_pct, vac_young_pct = excluded.vac_young_pct, holidays_pct = excluded.holidays_pct,
    thirteenth_pct = excluded.thirteenth_pct, avs_pct = excluded.avs_pct, ac_pct = excluded.ac_pct, ac_ceiling_year = excluded.ac_ceiling_year,
    aanp_pct = excluded.aanp_pct, ijm_pct = excluded.ijm_pct, lpp_pct = excluded.lpp_pct, pay_day = excluded.pay_day, updated_at = now();
  if jsonb_typeof(p->'postes') = 'object' then
    update poste set hourly_rate = nullif(p->'postes'->>name, '')::numeric where company_id = g.company_id and p->'postes' ? name;
  end if;
  insert into access_log(company_id, who, action) values (g.company_id, g.first_name, 'Réglages des salaires modifiés');
end $$;

-- ---------------------------------------------------------------- dossier de paie d'une personne
create or replace function rpc_paie_membre(p_member uuid, p_year int) returns jsonb language plpgsql stable security definer as $$
declare g member; m member; p member_profile;
begin
  g := gerant();
  select * into m from member where id = p_member and company_id = g.company_id;
  if m.id is null then raise exception 'Membre inconnu'; end if;
  select * into p from member_profile where member_id = m.id;
  return jsonb_build_object('poste', (select name from poste where id = m.poste_id),
    'posteRate', (select hourly_rate from poste where id = m.poste_id),
    'sourceTaxPct', p.source_tax_pct, 'avsOnRequest', coalesce(p.avs_on_request, false),
    'contracts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'poste', c.poste, 'fonction', c.fonction, 'start', c.start_date, 'end', c.end_date,
        'hourlyRate', c.hourly_rate, 'hrDocumentId', c.hr_document_id) order by c.start_date desc) from employment_contract c where c.member_id = m.id), '[]'),
    'payslips', coalesce((select jsonb_agg(jsonb_build_object('month', s.month, 'gross', s.gross, 'net', s.net, 'avsBase', s.avs_base, 'acBase', s.ac_base,
        'hrDocumentId', s.hr_document_id) order by s.month) from payslip s where s.member_id = m.id and extract(year from s.month) = p_year), '[]'));
end $$;

create or replace function rpc_paie_membre_maj(p_member uuid, p_source_tax numeric, p_avs_on_request boolean) returns void language plpgsql security definer as $$
declare g member;
begin
  g := gerant();
  if p_source_tax is not null and p_source_tax not between 0 and 40 then raise exception 'Taux d''impôt à la source hors limites'; end if;
  insert into member_profile(member_id, company_id, source_tax_pct, avs_on_request)
    select id, company_id, p_source_tax, coalesce(p_avs_on_request, false) from member where id = p_member and company_id = g.company_id
  on conflict (member_id) do update set source_tax_pct = excluded.source_tax_pct, avs_on_request = excluded.avs_on_request;
end $$;

create or replace function rpc_contrat_enregistrer(p_member uuid, p_poste text, p_fonction text, p_start date, p_end date, p_rate numeric, p_hr_doc uuid)
returns uuid language plpgsql security definer as $$
declare g member; nid uuid;
begin
  g := gerant();
  if not exists (select 1 from member where id = p_member and company_id = g.company_id) then raise exception 'Membre inconnu'; end if;
  insert into employment_contract(company_id, member_id, poste, fonction, start_date, end_date, hourly_rate, hr_document_id, created_by)
    values (g.company_id, p_member, p_poste, btrim(p_fonction), p_start, p_end, p_rate, p_hr_doc, g.id) returning id into nid;
  return nid;
end $$;

create or replace function rpc_fiche_enregistrer(p_member uuid, p_month date, p_hours numeric, p_rate numeric, p_gross numeric, p_avs_base numeric,
  p_ac_base numeric, p_net numeric, p_data jsonb, p_hr_doc uuid) returns void language plpgsql security definer as $$
declare g member;
begin
  g := gerant();
  if not exists (select 1 from member where id = p_member and company_id = g.company_id) then raise exception 'Membre inconnu'; end if;
  if exists (select 1 from payslip where member_id = p_member and month = date_trunc('month', p_month)::date) then
    raise exception 'Fiche de salaire déjà établie pour ce mois (retirez-la d''abord pour la refaire)';
  end if;
  insert into payslip(company_id, member_id, month, hours, hourly_rate, gross, avs_base, ac_base, net, data, hr_document_id, created_by)
    values (g.company_id, p_member, date_trunc('month', p_month)::date, p_hours, p_rate, p_gross, p_avs_base, p_ac_base, p_net, p_data, p_hr_doc, g.id);
end $$;

-- Retirer une fiche (erreur) : seulement tant qu'elle n'a pas été ouverte par la personne
create or replace function rpc_fiche_retirer(p_member uuid, p_month date) returns void language plpgsql security definer as $$
declare g member; s payslip; d hr_document;
begin
  g := gerant();
  select * into s from payslip where member_id = p_member and month = date_trunc('month', p_month)::date and company_id = g.company_id;
  if s.id is null then raise exception 'Fiche inconnue'; end if;
  select * into d from hr_document where id = s.hr_document_id;
  if d.seen_at is not null then raise exception 'Fiche déjà consultée par la personne : établissez plutôt une fiche rectificative'; end if;
  delete from payslip where id = s.id;
  if d.id is not null then delete from hr_document where id = d.id; end if;
  insert into access_log(company_id, who, action) values (g.company_id, g.first_name, 'Fiche de salaire retirée : ' || to_char(s.month, 'MM.YYYY'));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname in ('gerant','rpc_paie_reglages','rpc_paie_reglages_maj','rpc_paie_membre','rpc_paie_membre_maj',
             'rpc_contrat_enregistrer','rpc_fiche_enregistrer','rpc_fiche_retirer') loop
    execute format('alter function %s set search_path = norma, pg_catalog, public, extensions', f.sig);
    execute format('alter function %s set timezone = %L', f.sig, 'Europe/Zurich');
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;
grant execute on function rpc_paie_reglages(), rpc_paie_reglages_maj(jsonb), rpc_paie_membre(uuid, int), rpc_paie_membre_maj(uuid, numeric, boolean),
  rpc_contrat_enregistrer(uuid, text, text, date, date, numeric, uuid),
  rpc_fiche_enregistrer(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, uuid), rpc_fiche_retirer(uuid, date) to authenticated;
