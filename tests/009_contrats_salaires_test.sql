-- Tests 009 : contrats à signer et fiches de salaire.
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
create temp table v(k text primary key, val text); grant all on v to authenticated;
-- Esteban a un compte (008)
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);   -- Gérant
insert into v values ('c', norma.rpc_rh_ajouter('20000000-0000-0000-0000-000000000002', 'contrat', 'Contrat saison 2027', null,
  '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/contrat/c.pdf', repeat('a', 64), true)->>'id');
insert into v values ('f', norma.rpc_rh_ajouter('20000000-0000-0000-0000-000000000002', 'fiche_salaire', 'Salaire octobre 2026', '2026-10-01',
  '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/fiche_salaire/f.pdf', repeat('b', 64), true)->>'id');
select pg_temp.expect(not ((select jsonb_agg(x) from jsonb_array_elements(norma.rpc_rh_membre('20000000-0000-0000-0000-000000000002')) x where x->>'kind' = 'fiche_salaire')->0->>'requiresSignature')::boolean,
  'Fiche de salaire : jamais « à signer »');
select pg_temp.expect_error($$select norma.rpc_rh_ajouter('20000000-0000-0000-0000-000000000002', 'contrat', 'X', null, 'autre/chemin.pdf', repeat('a', 64), true)$$, 'Emplacement');
reset role;
-- Manager (008) : pas d'accès aux salaires
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000009', false);
select pg_temp.expect_error($$select norma.rpc_rh_membre('20000000-0000-0000-0000-000000000002')$$, 'réservé au Gérant');
-- Esteban
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002', false);
select pg_temp.expect(jsonb_array_length(norma.rpc_mes_rh()) = 2 and ((norma.rpc_mes_rh()->0)->>'kind') = 'contrat', 'Employé : contrat à signer en premier, fiche de salaire');
select pg_temp.expect_error($$select norma.rpc_rh_signer((select val::uuid from v where k = 'c'), 'Esteban Quispe', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/signature/s.png', repeat('a', 64), 'iPhone')$$, 'Ouvrez et lisez');
select norma.rpc_rh_vu((select val::uuid from v where k = 'c'));
select pg_temp.expect_error($$select norma.rpc_rh_signer((select val::uuid from v where k = 'c'), 'Esteban Quispe', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/signature/s.png', repeat('c', 64), 'iPhone')$$, 'fichier a changé');
select pg_temp.expect_error($$select norma.rpc_rh_signer((select val::uuid from v where k = 'f'), 'Esteban Quispe', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/signature/s.png', repeat('b', 64), 'iPhone')$$, 'pas à signer');
select pg_temp.expect((norma.rpc_rh_signer((select val::uuid from v where k = 'c'), 'Esteban Quispe', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/signature/s.png', repeat('a', 64), 'iPhone')->>'signedName') = 'Esteban Quispe', 'Contrat signé');
select pg_temp.expect_error($$select norma.rpc_rh_signer((select val::uuid from v where k = 'c'), 'Esteban Quispe', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/signature/s.png', repeat('a', 64), 'iPhone')$$, 'déjà signé');
-- Gérant : un document signé ne peut plus être supprimé
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect_error($$select norma.rpc_rh_supprimer((select val::uuid from v where k = 'c'))$$, 'suppression impossible');
select norma.rpc_rh_supprimer((select val::uuid from v where k = 'f'));
select pg_temp.expect(jsonb_array_length(norma.rpc_rh_membre('20000000-0000-0000-0000-000000000002')) = 1, 'Fiche non signée retirée');
reset role;
select pg_temp.expect((select count(*) from jsonb_array_elements(push_a_envoyer(now())) x where x->>'title' = 'Document signé') = 1, 'Notification au Gérant : document signé');
select 'TOUS LES TESTS 009 RÉUSSIS' as resultat;
