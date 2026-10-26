-- Tests 012 : liste « à faire », pastilles et notifications personnelles.
set search_path = norma, public, extensions;
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(cond boolean, label text) returns text language plpgsql as $$
begin if not cond then raise exception 'ÉCHEC : %', label; end if; return 'OK  ' || label; end $$;
create or replace function pg_temp.expect_error(sql text, fragment text) returns text language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : aucune erreur pour [%]', sql;
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if position(fragment in sqlerrm) = 0 then raise exception 'ÉCHEC : erreur inattendue [%] pour [%]', sqlerrm, sql; end if;
  return 'OK  ' || fragment;
end $$;
grant execute on function pg_temp.expect(boolean, text), pg_temp.expect_error(text, text) to authenticated;
create temp table v(k text primary key, val text); grant all on v to authenticated;
create or replace function pg_temp.kinds(j jsonb) returns text[] language sql as $$ select array_agg(x->>'kind' order by x->>'kind') from jsonb_array_elements(j->'items') x $$;
grant execute on function pg_temp.kinds(jsonb) to authenticated;

-- Esteban (employé) : abonnement de son téléphone + état de départ
insert into push_subscription(member_id, endpoint, p256dh, auth) values ('20000000-0000-0000-0000-000000000002', 'https://push.example/esteban', 'k', 'a')
  on conflict (endpoint) do nothing;
truncate push_sent;
insert into v values ('version', privacy_current());
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002', false);
insert into v values ('avant', norma.rpc_mes_a_faire()::text);
select pg_temp.expect(not ('signer' = any(pg_temp.kinds((select val::jsonb from v where k = 'avant')))), 'Aucun contrat à signer au départ (signé en 009)');
select norma.rpc_push_abonner('https://push.example/esteban-2', 'k', 'a');
select pg_temp.expect(norma.rpc_push_actif(), 'Employé : notifications activées sur son téléphone');

-- Le Gérant dépose un contrat et une fiche de salaire ; il crée un événement qui commence demain avec Esteban
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
insert into v values ('c', norma.rpc_rh_ajouter('20000000-0000-0000-0000-000000000002', 'avenant', 'Avenant hiver', null,
  '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/avenant/a.pdf', repeat('d', 64), true)->>'id');
insert into v values ('f', norma.rpc_rh_ajouter('20000000-0000-0000-0000-000000000002', 'fiche_salaire', 'Salaire novembre 2026', '2026-11-01',
  '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/fiche_salaire/n.pdf', repeat('e', 64), false)->>'id');
insert into v values ('e', norma.rpc_evenement(null, 'Marché de Noël', 'Montreux', norma.today_ch() + 1, norma.today_ch() + 3, '', '', '',
  array['20000000-0000-0000-0000-000000000002']::uuid[], '{}'::uuid[])::text);
reset role;

-- Notifications : contrat (urgent, 🔴), fiche de salaire, nouvel événement ; au téléphone d'Esteban, avec le nombre pour l'icône
create temp table envoi as select x from jsonb_array_elements(push_a_envoyer(now())) x;
select pg_temp.expect((select count(*) from envoi where x->>'key' in (select 'rhnew:' || val from v where k in ('c','f'))) = 2, 'Notifications : contrat + fiche de salaire');
select pg_temp.expect((select (x->>'title') like '🔴%' and (x->>'urgent')::boolean from envoi where x->>'key' = 'rhnew:' || (select val from v where k = 'c')),
  'Contrat à signer : notification urgente 🔴');
select pg_temp.expect((select jsonb_array_length(x->'to') = 2 and ((x->'to'->0->>'badge')::int) >= 4 from envoi where x->>'key' = 'rhnew:' || (select val from v where k = 'f')),
  'Envoyée à ses 2 appareils, avec le nombre pour l’icône');
select pg_temp.expect((select count(*) from envoi where x->>'key' like 'plan:%' and (x->>'urgent')::boolean) = 1, 'Nouvel événement (demain) : notification urgente');
select pg_temp.expect(jsonb_array_length(push_a_envoyer(now())) = 0, 'Chaque notification ne part qu’une fois');

-- Pastilles : à signer (urgent), document non lu, planning (urgent : demain), fiche + formation urgentes (événement proche)
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002', false);
insert into v values ('apres', norma.rpc_mes_a_faire()::text);
select pg_temp.expect(pg_temp.kinds((select val::jsonb from v where k = 'apres')) @> array['documents','planning','signer'], 'À faire : signer, documents, planning');
select pg_temp.expect((select bool_and((x->>'urgent')::boolean) from jsonb_array_elements((select val::jsonb from v where k = 'apres')->'items') x
  where x->>'kind' in ('signer','planning')), 'Signer et événement de demain : urgents');
select norma.rpc_planning_vu();
select norma.rpc_rh_vu((select val::uuid from v where k = 'f'));
select pg_temp.expect(not (pg_temp.kinds(norma.rpc_mes_a_faire()) && array['planning','documents']), 'Planning vu et fiche ouverte : pastilles retirées');
select pg_temp.expect_error($$select norma.rpc_ma_notice_lue('1999-01-01')$$, 'Notice périmée');
select norma.rpc_ma_notice_lue((select val from v where k = 'version'));
select pg_temp.expect(not ('notice' = any(pg_temp.kinds(norma.rpc_mes_a_faire()))), 'Notice lue sur le téléphone');
reset role;

-- Fiche personnelle : pièce d'identité suisse → pas de date de permis demandée (011)
select pg_temp.expect((select permit_until is null from member_profile where member_id = '20000000-0000-0000-0000-000000000002')
  or (select permit not in ('', 'CH') from member_profile where member_id = '20000000-0000-0000-0000-000000000002'), 'Permis CH : jamais de date de validité');
update member_profile set permit = 'CH', permit_until = '2030-01-01' where member_id = '20000000-0000-0000-0000-000000000002';
select pg_temp.expect((select permit_until is null from member_profile where member_id = '20000000-0000-0000-0000-000000000002'), 'Suisse : date du permis effacée par la base');

-- Gérant : badge = ses tâches + incidents ouverts
select pg_temp.expect((select badge_total(id) >= nc_ouvertes(company_id) and nc_ouvertes(company_id) > 0 from member where auth_user_id = 'a0000000-0000-0000-0000-000000000001'),
  'Gérant : incidents ouverts comptés dans la pastille');
select 'TOUS LES TESTS 012 RÉUSSIS' as resultat;
