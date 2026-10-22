-- Tests d'accès : on se fait passer pour la tablette, puis pour un iPhone, avec le rôle « authenticated ».
set search_path = norma, public;
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

-- Données : tablette de l'entreprise + une 2e entreprise étrangère
insert into device(id, company_id, name, auth_user_id) values
 ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tablette stand','a0000000-0000-0000-0000-00000000000a');
update member set auth_user_id = 'a0000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000001';
insert into company(id, name) values ('00000000-0000-0000-0000-000000000099','Autre stand');
insert into equipment(company_id, name, type, min_value, max_value) values ('00000000-0000-0000-0000-000000000099','Frigo étranger','froid_positif',0,4);
select set_member_pin('20000000-0000-0000-0000-000000000004','5913');

-- ===== Tablette
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000a', false);

select pg_temp.expect_error($$insert into norma.temperature_reading(company_id,equipment_id,member_id,value,measured_at) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',3,now())$$, 'permission denied');
select pg_temp.expect_error($$update norma.member set poste_id = poste_id$$, 'permission denied');
select pg_temp.expect_error($$select pin_hmac from norma.member$$, 'permission denied');
select pg_temp.expect((select count(*) from norma.equipment where name = 'Frigo étranger') = 0, 'Données d''une autre entreprise invisibles');
select pg_temp.expect((select count(*) from norma.time_entry) = 0, 'Tablette ne voit pas les heures');

create temp table s as select * from norma.rpc_ouvrir_session('5913');
select pg_temp.expect((select prenom = 'Caisse' and not ('releves' = any(droits)) and 'allergenes_lecture' = any(droits) from s), 'Code Caisse → session avec ses droits');
select norma.rpc_prise_de_poste((select token from s), true, true, true, true);
select pg_temp.expect_error($$select norma.rpc_releve((select token from s),'30000000-0000-0000-0000-000000000001',3,now())$$, 'pas le droit');
select norma.rpc_nettoyage((select token from s), '40000000-0000-0000-0000-000000000001', 'Détergent');
select pg_temp.expect_error($$select norma.rpc_ouvrir_session('0000')$$, 'Code incorrect');
select pg_temp.expect_error($$select norma.rpc_releve('11111111-1111-1111-1111-111111111111','30000000-0000-0000-0000-000000000001',3,now())$$, 'Session expirée');
select norma.rpc_depointer((select token from s));
select pg_temp.expect_error($$select norma.rpc_nettoyage((select token from s), '40000000-0000-0000-0000-000000000001', 'x')$$, 'Session expirée');

-- ===== iPhone du Gérant (dépannage)
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect((select status from norma.rpc_releve(null,'30000000-0000-0000-0000-000000000001',2.5,now())) = 'vert', 'Gérant : relevé de dépannage depuis l''iPhone');
reset role;
select pg_temp.expect((select source_device from temperature_reading order by received_at desc limit 1) = 'iphone_gerant', 'Saisie marquée « iPhone Gérant »');
set role authenticated;
select pg_temp.expect((select count(*) from norma.time_entry) > 0, 'Gérant voit les heures de l''équipe');

-- ===== Inconnu
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000000', false);
select pg_temp.expect_error($$select norma.rpc_ouvrir_session('5913')$$, 'Appareil non autorisé');
select pg_temp.expect((select count(*) from norma.equipment) = 0, 'Compte inconnu : rien de visible');
reset role;
select 'TOUS LES TESTS ACCÈS RÉUSSIS' as resultat;
