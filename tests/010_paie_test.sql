-- Tests 010 : réglages de paie, taux par poste, contrats et fiches enregistrés (Gérant seul).
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
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect((norma.rpc_paie_reglages()->>'aanpPct') is null and (norma.rpc_paie_reglages()->>'avsPct')::numeric = 5.3, 'Réglages par défaut : AVS 5,3 %, AANP à saisir');
select norma.rpc_paie_reglages_maj('{"vacPct":8.33,"vacYoungPct":10.64,"holidaysPct":2.27,"thirteenthPct":8.33,"avsPct":5.3,"acPct":1.1,"aanpPct":1.2,"ijmPct":0,"lppPct":0,"postes":{"Chef de cuisine":"26","Caisse":"22.5"}}');
select pg_temp.expect((norma.rpc_paie_reglages()->'postes'->>'Chef de cuisine')::numeric = 26, 'Taux horaire par poste');
select pg_temp.expect((norma.rpc_paie_membre('20000000-0000-0000-0000-000000000002', 2026)->>'posteRate')::numeric = 26, 'Taux du poste de la personne');
select norma.rpc_paie_membre_maj('20000000-0000-0000-0000-000000000002', 4.5, true);
select norma.rpc_contrat_enregistrer('20000000-0000-0000-0000-000000000002', 'Chef de cuisine', 'chef de cuisine', '2026-08-20', '2026-08-23', 26, null);
select norma.rpc_fiche_enregistrer('20000000-0000-0000-0000-000000000002', '2026-08-15', 31.5, 26, 819, 819, 819, 700, '{}', null);
select pg_temp.expect_error($$select norma.rpc_fiche_enregistrer('20000000-0000-0000-0000-000000000002', '2026-08-01', 1, 26, 26, 0, 0, 26, '{}', null)$$, 'déjà établie');
select pg_temp.expect((select jsonb_array_length(j->'contracts') = 1 and jsonb_array_length(j->'payslips') = 1 and (j->>'sourceTaxPct')::numeric = 4.5
  from (select norma.rpc_paie_membre('20000000-0000-0000-0000-000000000002', 2026) j) x), 'Dossier de paie : contrat, fiche, impôt à la source');
select norma.rpc_fiche_retirer('20000000-0000-0000-0000-000000000002', '2026-08-01');
-- Manager : refusé
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000009', false);
select pg_temp.expect_error($$select norma.rpc_paie_reglages()$$, 'réservé au Gérant');
reset role;
select 'TOUS LES TESTS 010 RÉUSSIS' as resultat;
