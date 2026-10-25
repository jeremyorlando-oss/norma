-- NORMA 007 — mode hors ligne de la tablette (cahier des charges : « toutes les saisies fonctionnent sans réseau »).
-- Principe : la tablette garde les saisies dans une file d'attente, puis les rejoue à la reconnexion avec l'heure réelle
-- de la saisie. Le serveur reste l'autorité : mêmes contrôles de droits et de règles qu'en ligne.
-- Garde-fous : seule la tablette du stand peut rejouer ; heure acceptée seulement dans les 72 dernières heures ;
-- chaque saisie n'est enregistrée qu'une fois (numéro unique) ; reçu conservé (heure de saisie + heure de synchronisation).
set search_path = norma, public, extensions;

-- ================================================================ heure de la saisie
-- Dans les fonctions NORMA, « now() » désigne norma.now() : l'heure réelle de la saisie pendant un rejeu, sinon l'heure du serveur.
create or replace function norma.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('norma.client_at', true), '')::timestamptz, pg_catalog.now());
$$;

-- Valeurs par défaut des colonnes d'horodatage et des dates : heure de la saisie
do $$
declare c record;
begin
  for c in select table_name, column_name, column_default from information_schema.columns
           where table_schema = 'norma' and column_default in ('now()', 'CURRENT_DATE') loop
    execute format('alter table norma.%I alter column %I set default %s', c.table_name, c.column_name,
      case when c.column_default = 'now()' then 'norma.now()' else 'norma.local_day(norma.now())' end);
  end loop;
end $$;

-- Réception : la DLC est comparée au jour de la réception (et non au jour de la synchronisation)
create or replace function reception_before() returns trigger language plpgsql as $$
begin
  if not has_right(new.member_id, 'reception') then raise exception 'Ce poste n''a pas le droit de réceptionner'; end if;
  if new.accepted and not (new.packaging_ok and new.aspect_ok and new.order_ok and new.cold_chain_ok) then
    raise exception 'Acceptation impossible : un contrôle est à NON';
  end if;
  if new.accepted and new.dlc < local_day(now()) then raise exception 'Acceptation impossible : DLC dépassée'; end if;
  return new;
end $$;

-- ================================================================ rejeu des saisies faites hors ligne
create table sync_receipt (
  id uuid primary key,                         -- numéro unique de la saisie, créé par la tablette
  company_id uuid not null references company(id),
  device_id uuid not null references device(id),
  member_id uuid not null references member(id),
  fn text not null,
  client_at timestamptz not null,              -- heure réelle de la saisie sur la tablette
  synced_at timestamptz not null default pg_catalog.now(),   -- heure d'arrivée sur le serveur
  result jsonb
);
alter table sync_receipt enable row level security;
create trigger sync_receipt_no_update before update or delete on sync_receipt for each row execute function forbid_change();

-- Saisies autorisées hors ligne (les lots de préparation exigent le réseau : numéro de lot unique)
create or replace function offline_fns() returns text[] language sql immutable as $$
  select array['session','rpc_depointer','rpc_prise_de_poste','rpc_notice_lue','rpc_formation','rpc_pause','rpc_releve2','rpc_nettoyage2',
    'rpc_huile','rpc_reception','rpc_jeter','rpc_signaler2','rpc_checklist','rpc_chaud_debut','rpc_chaud_fin','rpc_courant_retabli','rpc_nc_etape'];
$$;

create or replace function rpc_rejouer(p_id uuid, p_member uuid, p_fn text, p_args jsonb, p_client_at timestamptz) returns jsonb
language plpgsql security definer as $$
declare d device; m member; done sync_receipt; tok uuid; f record; call text := ''; i int; argn text; argt text; res jsonb;
begin
  select * into d from device where auth_user_id = auth.uid() and active;
  if d.id is null then raise exception 'Seule la tablette du stand peut synchroniser'; end if;
  select * into done from sync_receipt where id = p_id;
  if done.id is not null then return done.result; end if;          -- déjà enregistrée : rien à refaire
  if not (p_fn = any(offline_fns())) then raise exception 'Saisie non autorisée hors ligne : %', p_fn; end if;
  if p_client_at > pg_catalog.now() + interval '5 minutes' or p_client_at < pg_catalog.now() - interval '72 hours' then
    raise exception 'Heure de saisie hors limites (72 h max)';
  end if;
  select * into m from member where id = p_member and company_id = d.company_id and active;
  if m.id is null then raise exception 'Personne inconnue ou désactivée'; end if;

  perform set_config('norma.client_at', p_client_at::text, true);    -- toutes les écritures prennent l'heure de la saisie
  if p_fn = 'session' then
    res := to_jsonb(open_session(m.id));                              -- arrivée pointée si la personne ne l'était pas
  else
    insert into stand_session(device_id, member_id) values (d.id, m.id) returning token into tok;
    select p.oid, p.proargnames, p.proargtypes, p.pronargs, p.proretset, p.prorettype into f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'norma' and p.proname = p_fn;
    for i in 1 .. f.pronargs loop
      argn := f.proargnames[i];
      argt := format_type(f.proargtypes[i - 1], null);
      call := call || case when i > 1 then ', ' else '' end || format('%I => ', argn) ||
        case when argn = 'p_token' then quote_literal(tok) || '::uuid'
             when argt = 'jsonb' then format('%L::jsonb', coalesce(p_args->argn, 'null'))
             when argt like '%[]' then format('(select array_agg(x) from jsonb_array_elements_text(%L::jsonb) x)::%s', coalesce(p_args->argn, '[]'), argt)
             else format('%L::%s', p_args->>argn, argt) end;
    end loop;
    if f.prorettype = 'void'::regtype then
      execute format('select norma.%I(%s)', p_fn, call);
    elsif f.proretset then
      execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]'') from norma.%I(%s) r', p_fn, call) into res;
    else
      execute format('select to_jsonb(norma.%I(%s))', p_fn, call) into res;
    end if;
    delete from stand_session where token = tok;
  end if;
  insert into sync_receipt(id, company_id, device_id, member_id, fn, client_at, result)
    values (p_id, d.company_id, d.id, m.id, p_fn, p_client_at, res);
  return res;
end $$;

-- Saisies synchronisées après coup (journal Direction et rapport)
create or replace function rpc_saisies_hors_ligne(p_day date) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('who', m.first_name, 'fn', s.fn, 'clientAt', s.client_at, 'syncedAt', s.synced_at) order by s.client_at), '[]')
  from sync_receipt s join member m on m.id = s.member_id
  where s.company_id = my_company() and local_day(s.client_at) = p_day;
$$;

-- ================================================================ droits et chemin de recherche
-- « norma » avant « pg_catalog » : now() désigne norma.now() dans toutes les fonctions NORMA
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.prokind = 'f' loop
    execute format('alter function %s set search_path = norma, pg_catalog, public, extensions', f.sig);
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
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'norma' and p.proname in ('invitation_valide','invitation_utiliser','cron_verifier','rapports_a_envoyer',
               'rapport_envoye','push_cles_enregistrer','push_cles','push_supprimer','push_a_envoyer') loop
      execute format('grant execute on function %s to service_role', f.sig);
    end loop;
  end if;
end $$;
grant execute on function my_company(), my_member(), has_right(uuid, right_code), today_ch() to authenticated;
grant execute on function norma.now() to authenticated;
