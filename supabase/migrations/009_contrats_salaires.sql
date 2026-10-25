-- NORMA 009 — contrats à signer et fiches de salaire (V1.2, D30) : transmission seulement, aucun calcul de salaire.
-- Le Gérant dépose les PDF ; la personne les consulte dans son espace et signe les contrats dans l'app.
-- Signature dans l'app = signature électronique simple (preuve de lecture et d'acceptation : nom, tracé, date/heure,
-- empreinte SHA-256 du fichier signé, appareil). Elle ne remplace PAS la forme écrite (CO 14 al. 2bis) exigée pour
-- certaines clauses (temps d'essai > 1 mois CO 335b al. 2, renonciation aux heures supplémentaires CO 321c al. 3,
-- prohibition de concurrence CO 340 al. 1, contrat d'apprentissage CO 344a) : signature manuscrite ou qualifiée.
set search_path = norma, public, extensions;

create table hr_document (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  member_id uuid not null references member(id),
  kind text not null check (kind in ('contrat','avenant','fiche_salaire','certificat_salaire','attestation','autre')),
  title text not null check (length(btrim(title)) between 2 and 120),
  period date,                                  -- mois de la fiche de salaire (1er du mois) ou année du certificat
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  requires_signature boolean not null default false,
  uploaded_by uuid not null references member(id),
  uploaded_at timestamptz not null default now(),
  seen_at timestamptz,
  signed_at timestamptz,
  signed_name text,
  signature_path text,
  signed_device text
);
alter table hr_document enable row level security;
-- Un document signé ne change plus et ne peut pas être supprimé
create or replace function hr_document_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null then raise exception 'Document signé : suppression impossible'; end if;
    return old;
  end if;
  if old.signed_at is not null then raise exception 'Document signé : modification impossible'; end if;
  if new.path <> old.path or new.sha256 <> old.sha256 or new.member_id <> old.member_id or new.kind <> old.kind then
    raise exception 'Fichier déposé : modification impossible (supprimer puis redéposer)';
  end if;
  return new;
end $$;
create trigger hr_document_guard before update or delete on hr_document for each row execute function hr_document_guard();

create or replace function hr_json(d hr_document) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'memberId', d.member_id, 'kind', d.kind, 'title', d.title, 'period', d.period, 'path', d.path,
    'sha256', d.sha256, 'requiresSignature', d.requires_signature, 'uploadedAt', d.uploaded_at, 'seenAt', d.seen_at,
    'signedAt', d.signed_at, 'signedName', d.signed_name, 'signaturePath', d.signature_path, 'signedDevice', d.signed_device);
$$;

-- ---------------------------------------------------------------- Gérant
create or replace function rpc_rh_ajouter(p_member uuid, p_kind text, p_title text, p_period date, p_path text, p_sha256 text, p_sign boolean)
returns jsonb language plpgsql security definer as $$
declare g member; t member; d hr_document;
begin
  g := iphone_member();
  perform need(g.id, 'reglages_gerant', 'Contrats et salaires : réservé au Gérant');
  select * into t from member where id = p_member and company_id = g.company_id;
  if t.id is null then raise exception 'Membre inconnu'; end if;
  if p_path not like g.company_id || '/' || t.id || '/' || p_kind || '/%' then raise exception 'Emplacement du fichier refusé'; end if;
  insert into hr_document(company_id, member_id, kind, title, period, path, sha256, requires_signature, uploaded_by)
    values (g.company_id, t.id, p_kind, btrim(p_title), p_period, p_path, lower(p_sha256), coalesce(p_sign, false) and p_kind in ('contrat','avenant'), g.id)
    returning * into d;
  insert into access_log(company_id, who, action) values (g.company_id, g.first_name, 'Document RH déposé pour ' || t.first_name || ' : ' || d.title);
  return hr_json(d);
end $$;

create or replace function rpc_rh_membre(p_member uuid) returns jsonb language plpgsql stable security definer as $$
declare g member;
begin
  g := iphone_member();
  perform need(g.id, 'reglages_gerant', 'Contrats et salaires : réservé au Gérant');
  return coalesce((select jsonb_agg(hr_json(d) order by coalesce(d.period, d.uploaded_at::date) desc, d.uploaded_at desc)
    from hr_document d where d.member_id = p_member and d.company_id = g.company_id), '[]');
end $$;

create or replace function rpc_rh_supprimer(p_id uuid) returns void language plpgsql security definer as $$
declare g member; d hr_document;
begin
  g := iphone_member();
  perform need(g.id, 'reglages_gerant', 'Contrats et salaires : réservé au Gérant');
  delete from hr_document where id = p_id and company_id = g.company_id returning * into d;
  if d.id is null then raise exception 'Document inconnu'; end if;
  insert into access_log(company_id, who, action) values (g.company_id, g.first_name, 'Document RH retiré : ' || d.title);
end $$;

-- ---------------------------------------------------------------- personne concernée (son téléphone)
create or replace function rpc_mes_rh() returns jsonb language plpgsql stable security definer as $$
declare m member;
begin
  m := employee_member();
  return coalesce((select jsonb_agg(hr_json(d) order by (d.requires_signature and d.signed_at is null) desc,
      coalesce(d.period, d.uploaded_at::date) desc, d.uploaded_at desc) from hr_document d where d.member_id = m.id), '[]');
end $$;

create or replace function rpc_rh_vu(p_id uuid) returns void language plpgsql security definer as $$
declare m member;
begin
  m := employee_member();
  update hr_document set seen_at = now() where id = p_id and member_id = m.id and seen_at is null and signed_at is null;
end $$;

create or replace function rpc_rh_signer(p_id uuid, p_name text, p_signature_path text, p_sha256 text, p_device text) returns jsonb
language plpgsql security definer as $$
declare m member; d hr_document; ip text;
begin
  m := employee_member();
  select * into d from hr_document where id = p_id and member_id = m.id for update;
  if d.id is null then raise exception 'Document inconnu'; end if;
  if not d.requires_signature then raise exception 'Ce document n’est pas à signer'; end if;
  if d.signed_at is not null then raise exception 'Document déjà signé'; end if;
  if d.seen_at is null then raise exception 'Ouvrez et lisez le document avant de signer'; end if;
  if lower(p_sha256) <> d.sha256 then raise exception 'Le fichier a changé : rouvrez le document avant de signer'; end if;
  if length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'Écrivez votre nom complet'; end if;
  if p_signature_path not like d.company_id || '/' || m.id || '/signature/%' then raise exception 'Signature manquante'; end if;
  ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  update hr_document set signed_at = now(), signed_name = btrim(p_name), signature_path = p_signature_path,
    signed_device = left(btrim(coalesce(p_device, '')) || case when ip <> '' then ' · IP ' || ip else '' end, 300)
    where id = d.id returning * into d;
  insert into access_log(company_id, who, action) values (d.company_id, m.first_name, 'Document signé : ' || d.title);
  return hr_json(d);
end $$;

-- ---------------------------------------------------------------- fichiers (Supabase Storage, privé)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      values ('documents-rh', 'documents-rh', false, 10485760, array['application/pdf','image/png'])
      on conflict (id) do nothing;
    -- Gérant : dépose et lit tout ; supprime les fichiers non signés (vérifié par la base)
    execute $p$create policy norma_rh_gerant on storage.objects for all to authenticated
      using (bucket_id = 'documents-rh' and (storage.foldername(name))[1] = norma.my_company()::text and norma.has_right(norma.my_member(), 'reglages_gerant'))
      with check (bucket_id = 'documents-rh' and (storage.foldername(name))[1] = norma.my_company()::text and norma.has_right(norma.my_member(), 'reglages_gerant'))$p$;
    -- personne concernée : lit ses documents, dépose seulement sa signature
    execute $p$create policy norma_rh_lecture on storage.objects for select to authenticated
      using (bucket_id = 'documents-rh' and (storage.foldername(name))[2] = norma.my_member()::text)$p$;
    execute $p$create policy norma_rh_signature on storage.objects for insert to authenticated
      with check (bucket_id = 'documents-rh' and (storage.foldername(name))[2] = norma.my_member()::text and (storage.foldername(name))[3] = 'signature'
                  and (storage.foldername(name))[1] = (select company_id::text from norma.member where id = norma.my_member()))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- notification au Gérant : document signé
create or replace function push_rh(p_now timestamptz) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', 'rh:' || d.id, 'title', 'Document signé',
      'body', m.first_name || ' a signé « ' || d.title || ' »', 'urgent', false, 'to', push_destinataires(d.company_id, 'reglages_gerant'))), '[]')
  from hr_document d join member m on m.id = d.member_id
  where d.signed_at > p_now - interval '30 minutes' and not exists (select 1 from push_sent where key = 'rh:' || d.id);
$$;
do $$
declare src text;
begin
  -- ajoute les documents signés aux notifications existantes (push_a_envoyer, migration 006)
  select pg_get_functiondef('norma.push_a_envoyer(timestamptz)'::regprocedure) into src;
  if position('push_rh(' in src) = 0 then
    src := replace(src, '  insert into push_sent(key) select x->>''key'' from jsonb_array_elements(res) x on conflict do nothing;',
      '  res := res || push_rh(p_now);' || chr(10) || '  insert into push_sent(key) select x->>''key'' from jsonb_array_elements(res) x on conflict do nothing;');
    execute src;
  end if;
end $$;

-- Notice de protection des données complétée (contrats, fiches de salaire, signature)
create or replace function privacy_current() returns text language sql immutable as $$ select '2026-10-25c' $$;

-- ================================================================ droits et chemin de recherche
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.proname in ('privacy_current','hr_document_guard','hr_json','rpc_rh_ajouter','rpc_rh_membre',
             'rpc_rh_supprimer','rpc_mes_rh','rpc_rh_vu','rpc_rh_signer','push_rh','push_a_envoyer') loop
    execute format('alter function %s set search_path = norma, pg_catalog, public, extensions', f.sig);
    execute format('alter function %s set timezone = %L', f.sig, 'Europe/Zurich');
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function norma.push_a_envoyer(timestamptz) to service_role';
  end if;
end $$;
grant execute on function rpc_rh_ajouter(uuid, text, text, date, text, text, boolean), rpc_rh_membre(uuid), rpc_rh_supprimer(uuid),
  rpc_mes_rh(), rpc_rh_vu(uuid), rpc_rh_signer(uuid, text, text, text, text) to authenticated;
