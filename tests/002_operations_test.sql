-- Tests des opérations (à lancer après 001_socle_test.sql, mêmes données de base)
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

-- Pointage
select pg_temp.expect(open_session('20000000-0000-0000-0000-000000000003') = 'arrivee', 'Premier code → arrivée');
select pg_temp.expect(open_session('20000000-0000-0000-0000-000000000003') = 'session', 'Code en journée → session, PAS de départ');
select pg_temp.expect(is_clocked_in('20000000-0000-0000-0000-000000000003'), 'Toujours pointé après plusieurs codes');
select depointer('20000000-0000-0000-0000-000000000003');
select pg_temp.expect(not is_clocked_in('20000000-0000-0000-0000-000000000003'), 'Départ uniquement via le bouton dépointer');
select pg_temp.expect_error($$select depointer('20000000-0000-0000-0000-000000000003')$$, 'non pointée');
select pg_temp.expect_error($$insert into time_entry(company_id,member_id,kind) values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','depart')$$, 'incohérent');
select pg_temp.expect_error($$insert into time_entry(company_id,member_id,kind,corrects_id,corrected_by,correction_reason) select company_id,member_id,'depart',id,'20000000-0000-0000-0000-000000000003','oubli' from time_entry limit 1$$, 'réservée');
insert into time_entry(company_id,member_id,kind,corrects_id,corrected_by,correction_reason)
  select company_id,member_id,'depart',id,'20000000-0000-0000-0000-000000000001','Oubli de pointage' from time_entry where kind='depart' limit 1;
select pg_temp.expect_error($$delete from time_entry$$, 'non modifiable');

-- Prise de poste obligatoire pour les relevés
select pg_temp.expect_error($$insert into temperature_reading(company_id,equipment_id,member_id,value,measured_at) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',3,now())$$, 'Prise de poste');
insert into shift_check(company_id,member_id,apte,tenue_ok,bijoux_ok,mains_ok) values
 ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',true,true,true,true),
 ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',true,true,true,true),
 ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',false,true,true,true);
insert into temperature_reading(company_id,equipment_id,member_id,value,measured_at) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',3,now());
select pg_temp.expect(not is_fit_today('20000000-0000-0000-0000-000000000004'), 'Non apte enregistré sans symptôme');

-- Nettoyage
select pg_temp.expect((select count(*) from cleaning_item where equipment_id='30000000-0000-0000-0000-000000000001') = 1, 'Équipement → tâche de nettoyage créée');
insert into cleaning_item(id,company_id,name,kind,product,frequency,interval_minutes) values
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Sol','zone','Détergent + désinfectant','intervalle',120);
select pg_temp.expect((select state from cleaning_state('40000000-0000-0000-0000-000000000001', now(), now() - interval '110 minutes')) = 'jaune', 'Sol : jaune 15 min avant');
select pg_temp.expect((select state from cleaning_state('40000000-0000-0000-0000-000000000001', now(), now() - interval '140 minutes')) = 'rouge', 'Sol : rouge après échéance');
insert into cleaning_done(item_id,member_id,product_used) values ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','Détergent + désinfectant');
select pg_temp.expect((select state from cleaning_state('40000000-0000-0000-0000-000000000001')) = 'ok', 'Caisse peut nettoyer → tâche à jour');

-- Huile
insert into equipment(id,company_id,name,type,max_value) values ('30000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','Friteuse 1','friteuse',175);
select pg_temp.expect_error($$insert into oil_check(company_id,equipment_id,member_id,moment,temperature) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','service',170)$$, 'pas une friteuse');
select pg_temp.expect_error($$insert into oil_check(company_id,equipment_id,member_id,moment) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000002','soir')$$, 'oil_check_check');
insert into oil_check(company_id,equipment_id,member_id,moment,polar_pct,filtered) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000002','soir',26,true);
select pg_temp.expect((select must_change from oil_check where moment='soir'), 'Soir : 26 % → changement à prévoir');
select pg_temp.expect((select count(*) from nonconformity where kind='huile') = 0, 'Soir : pas de NC (changement le lendemain)');
insert into oil_check(company_id,equipment_id,member_id,moment,temperature,defects) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000002','matin',170,'{fumee}');
select pg_temp.expect((select count(*) from nonconformity where kind='huile') = 1, 'Matin : huile dégradée non changée → NC');

-- Réception
select pg_temp.expect_error($$insert into reception(company_id,member_id,supplier,product,supplier_lot,dlc,temperature,packaging_ok,aspect_ok,order_ok,cold_chain_ok,accepted) values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Carnadis','Saucisse','L1',current_date+5,2.8,true,true,true,false,true)$$, 'contrôle est à NON');
select pg_temp.expect_error($$insert into reception(company_id,member_id,supplier,product,supplier_lot,dlc,temperature,packaging_ok,aspect_ok,order_ok,cold_chain_ok,accepted) values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','Carnadis','Saucisse','L1',current_date+5,2.8,true,true,true,true,true)$$, 'pas le droit');
insert into reception(company_id,member_id,supplier,product,supplier_lot,dlc,temperature,packaging_ok,aspect_ok,order_ok,cold_chain_ok,accepted,refusal_reason)
 values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Carnadis','Saucisse','L1',current_date+5,8.0,true,true,true,false,false,'Chaîne du froid rompue');
select pg_temp.expect((select count(*) from nonconformity where kind='reception') = 1, 'Refus → NC réception');

-- Lots de préparation
insert into recipe(id,company_id,name,code,allergens) values ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Sauce jalapeños','JAL','{oeufs,moutarde}');
insert into prep_lot(company_id,recipe_id,member_id,produced_on) values
 ('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','2026-10-22'),
 ('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','2026-10-22');
select pg_temp.expect((select array_agg(lot_code order by seq) from prep_lot) = '{JAL-221026-1,JAL-221026-2}', 'Lots JAL-221026-1 et -2');
select pg_temp.expect((select bool_and(use_by = '2026-10-24') from prep_lot), 'Date limite J+2 = 24.10.2026');
insert into prep_lot(company_id,recipe_id,member_id,produced_on) values ('00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',current_date - 10);
select pg_temp.expect((select status from lot_status where produced_on = current_date - 10) = 'a_jeter', 'Lot dépassé → à jeter');
select pg_temp.expect_error($$insert into lot_disposal(lot_id,member_id) select id,'20000000-0000-0000-0000-000000000004' from prep_lot where produced_on = current_date - 10$$, 'pas le droit');
insert into lot_disposal(lot_id,member_id) select id,'20000000-0000-0000-0000-000000000002' from prep_lot where produced_on = current_date - 10;
select pg_temp.expect((select status from lot_status where produced_on = current_date - 10) = 'jete', 'Lot jeté enregistré');
select pg_temp.expect_error($$insert into lot_disposal(lot_id,member_id) select id,'20000000-0000-0000-0000-000000000002' from prep_lot where produced_on = current_date - 10$$, 'lot_disposal_lot_id_key');
select 'TOUS LES TESTS OPÉRATIONS RÉUSSIS' as resultat;
