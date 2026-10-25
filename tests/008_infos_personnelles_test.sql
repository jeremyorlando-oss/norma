-- Tests 008 : informations personnelles, CV et certificats.
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

select pg_temp.expect(iban_valide('CH9300762011623852957') and not iban_valide('CH9300762011623852958'), 'Contrôle de l''IBAN');
select pg_temp.expect(avs_valide('756.1234.5678.97') and not avs_valide('756.1234.5678.98') and not avs_valide('7561234567897'), 'Contrôle du numéro AVS');
-- employé (Chef de cuisine Esteban, compte ajouté pour le test)
update member set auth_user_id = 'e0000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000002';
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002', false);
select pg_temp.expect_error($$select norma.rpc_mon_profil_maj('{"avs":"756.1234.5678.90"}')$$, 'AVS invalide');
select pg_temp.expect_error($$select norma.rpc_mon_profil_maj('{"email":"pas-un-mail"}')$$, 'E-mail invalide');
select pg_temp.expect_error($$select norma.rpc_mon_profil_maj('{"iban":"CH93 0076 2011 6238 5295 8"}')$$, 'IBAN invalide');
select norma.rpc_mon_profil_maj('{"prenoms":"Esteban Andrés","nom":"Quispe Oscco","avs":"756.1234.5678.97","email":"E@test.ch","phone":"079 000 00 00","street":"Rue 1","npa":"1030","city":"Bussigny","birthDate":"1999-05-04","nationality":"Suisse","permit":"CH","civilStatus":"celibataire","children":"0","iban":"CH93 0076 2011 6238 5295 7","ibanHolder":"Esteban Quispe","emergencyName":"Maman","emergencyPhone":"079 111 11 11"}');
select pg_temp.expect((norma.rpc_mon_profil()->>'avs') = '756.1234.5678.97' and (norma.rpc_mon_profil()->>'email') = 'e@test.ch', 'Employé : ses informations enregistrées');
select norma.rpc_document_ajoute('cv', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/cv/a.pdf', 'CV.pdf');
select norma.rpc_document_ajoute('certificat', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/certificat/b.pdf', 'CFC.pdf');
select pg_temp.expect(jsonb_array_length(norma.rpc_mes_documents()) = 2, 'CV et certificat déposés');
select pg_temp.expect_error($$select norma.rpc_profil_membre('20000000-0000-0000-0000-000000000003')$$, 'non autorisée');
-- Gérant : fiche complète
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect((norma.rpc_profil_membre('20000000-0000-0000-0000-000000000002')->>'avs') = '756.1234.5678.97'
  and (norma.rpc_profil_membre('20000000-0000-0000-0000-000000000002')->>'iban') = 'CH9300762011623852957', 'Gérant : fiche complète (AVS, IBAN)');
reset role;
-- Manager (poste de test avec gestion de l'équipe) : contact oui, salaire non
insert into poste(id, company_id, name, rights) values ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','Manager','{tableau_bord,gestion_equipe,heures_equipe,export}') on conflict do nothing;
insert into member(id, company_id, poste_id, first_name, last_name, auth_user_id) values ('20000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001',(select id from poste where company_id = '00000000-0000-0000-0000-000000000001' and name = 'Manager' limit 1),'Vincent','M','e0000000-0000-0000-0000-000000000009');
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000009', false);
select pg_temp.expect((norma.rpc_profil_membre('20000000-0000-0000-0000-000000000002')->>'phone') = '079 000 00 00'
  and not (norma.rpc_profil_membre('20000000-0000-0000-0000-000000000002') ? 'iban'), 'Manager : contact visible, données de salaire cachées');
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect((norma.rpc_profil_membre('20000000-0000-0000-0000-000000000003')->>'prenoms') = 'Aide', 'Fiche vide : prénom de la tablette');
reset role;
select 'TOUS LES TESTS 008 RÉUSSIS' as resultat;
