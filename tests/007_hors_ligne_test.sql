-- Tests 007 : saisies faites hors ligne puis rejouées par la tablette, avec l'heure réelle de la saisie.
set search_path = norma, public, extensions;
\set ON_ERROR_STOP on

create or replace function pg_temp.expect_error(sql text, fragment text) returns text language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : aucune erreur pour [%]', sql;
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if position(fragment in sqlerrm) = 0 then raise exception 'ÉCHEC : erreur inattendue [%] pour [%]', sqlerrm, sql; end if;
  return 'OK  ' || fragment;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns text language plpgsql as $$
begin if not cond then raise exception 'ÉCHEC : %', label; end if; return 'OK  ' || label; end $$;
grant execute on function pg_temp.expect(boolean, text), pg_temp.expect_error(text, text) to authenticated;
-- personne qui n'a encore rien fait aujourd'hui
insert into member(id, company_id, poste_id, first_name, last_name) values
  ('20000000-0000-0000-0000-000000000077','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Hors','Ligne');
create temp table c(k text primary key, at timestamptz);
insert into c values ('t0', pg_catalog.now() - interval '2 hours'), ('t1', pg_catalog.now() - interval '110 minutes'), ('t2', pg_catalog.now() - interval '105 minutes');
grant select on c to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000a', false);   -- tablette
select norma.rpc_rejouer('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000077', 'session', '{}', (select at from c where k = 't0'));
select norma.rpc_rejouer('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000077', 'rpc_nettoyage2',
  jsonb_build_object('p_item', (select id from norma.cleaning_item where company_id = '00000000-0000-0000-0000-000000000001' limit 1)), (select at from c where k = 't1'));
select norma.rpc_rejouer('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000077', 'rpc_prise_de_poste',
  '{"p_apte":true,"p_tenue":true,"p_bijoux":true,"p_mains":true}', (select at from c where k = 't1'));
select pg_temp.expect(norma.rpc_rejouer('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000077', 'rpc_releve2',
  '{"p_equipment":"30000000-0000-0000-0000-000000000001","p_value":9.5,"p_actions":["Produits isolés"]}', (select at from c where k = 't2')) #>> '{}' = 'rouge', 'Relevé rejoué : statut calculé par le serveur');
-- même numéro de saisie : rien n'est enregistré deux fois
select norma.rpc_rejouer('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000077', 'rpc_nettoyage2',
  jsonb_build_object('p_item', (select id from norma.cleaning_item where company_id = '00000000-0000-0000-0000-000000000001' limit 1)), (select at from c where k = 't1'));
select pg_temp.expect_error($$select norma.rpc_rejouer(gen_random_uuid(), '20000000-0000-0000-0000-000000000077', 'rpc_preparation', '{}', pg_catalog.now())$$, 'non autorisée hors ligne');
select pg_temp.expect_error($$select norma.rpc_rejouer(gen_random_uuid(), '20000000-0000-0000-0000-000000000077', 'rpc_pause', '{"p_debut":true}', pg_catalog.now() - interval '80 hours')$$, '72 h');
select pg_temp.expect_error($$select norma.rpc_rejouer(gen_random_uuid(), '20000000-0000-0000-0000-000000000077', 'rpc_pause', '{"p_debut":true}', pg_catalog.now() + interval '1 hour')$$, '72 h');
select pg_temp.expect_error($$select norma.rpc_rejouer(gen_random_uuid(), '20000000-0000-0000-0000-000000000099', 'rpc_pause', '{"p_debut":true}', pg_catalog.now())$$, 'inconnue');
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);   -- iPhone du Gérant
select pg_temp.expect_error($$select norma.rpc_rejouer(gen_random_uuid(), '20000000-0000-0000-0000-000000000077', 'rpc_pause', '{"p_debut":true}', pg_catalog.now())$$, 'Seule la tablette');
select pg_temp.expect(jsonb_array_length(norma.rpc_saisies_hors_ligne(norma.today_ch())) >= 2, 'Direction : saisies synchronisées après coup visibles');
reset role;

select pg_temp.expect(abs(extract(epoch from (select at from time_entry where member_id = '20000000-0000-0000-0000-000000000077' and kind = 'arrivee') - (select at from c where k = 't0'))) < 1,
  'Arrivée enregistrée à l''heure réelle (hors ligne)');
select pg_temp.expect((select count(*) from cleaning_done where member_id = '20000000-0000-0000-0000-000000000077') = 1, 'Nettoyage enregistré une seule fois');
select pg_temp.expect(abs(extract(epoch from (select at from cleaning_done where member_id = '20000000-0000-0000-0000-000000000077') - (select at from c where k = 't1'))) < 1,
  'Nettoyage à l''heure réelle');
select pg_temp.expect((select abs(extract(epoch from received_at - (select at from c where k = 't2'))) < 1 and abs(extract(epoch from measured_at - (select at from c where k = 't2'))) < 1
  from temperature_reading where member_id = '20000000-0000-0000-0000-000000000077'), 'Relevé à l''heure réelle');
select pg_temp.expect((select count(*) from nc_step s join nonconformity n on n.id = s.nc_id where n.opened_by = '20000000-0000-0000-0000-000000000077') = 1, 'Hors seuil : incident et mesure immédiate');
select pg_temp.expect((select bool_and(synced_at > client_at) from sync_receipt), 'Reçus : heure de saisie et heure de synchronisation');
select pg_temp.expect(norma.now() = pg_catalog.now(), 'En ligne : heure du serveur');
select 'TOUS LES TESTS 007 RÉUSSIS' as resultat;
