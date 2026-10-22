-- Tests du socle : chaque bloc doit réussir ou échouer comme attendu.
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

insert into company(id, name) values ('00000000-0000-0000-0000-000000000001', 'Original''s Completos');
insert into poste(id, company_id, name, rights, is_owner) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Gérant','{}',true),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Chef de cuisine',
   '{pointage,prise_poste,releves,reception,preparations,jeter_lot,nettoyage,signaler_nc,traiter_nc,cloturer_nc,tableau_bord}',false),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Aide de cuisine',
   '{pointage,prise_poste,nettoyage,signaler_nc}',false),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Caisse',
   '{pointage,prise_poste,nettoyage,signaler_nc,allergenes_lecture}',false);
insert into member(id, company_id, poste_id, first_name, last_name) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Orlando','Q'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Esteban','Q'),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Aide','A'),
 ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','Caisse','C');

-- Droits
select pg_temp.expect(has_right('20000000-0000-0000-0000-000000000001','reglages_gerant'), 'Gérant a tous les droits');
select pg_temp.expect(not has_right('20000000-0000-0000-0000-000000000003','releves'), 'Aide : pas de relevés par défaut');
update member set extra_rights = '{releves}' where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.expect(has_right('20000000-0000-0000-0000-000000000003','releves'), 'Aide : option relevés activable');
select pg_temp.expect(has_right('20000000-0000-0000-0000-000000000004','allergenes_lecture') and not has_right('20000000-0000-0000-0000-000000000004','releves'), 'Caisse : allergènes oui, relevés non');

-- PIN
select set_member_pin('20000000-0000-0000-0000-000000000002','4827');
select pg_temp.expect_error($$select set_member_pin('20000000-0000-0000-0000-000000000003','4827')$$, 'déjà attribué');
select pg_temp.expect_error($$select set_member_pin('20000000-0000-0000-0000-000000000003','1234')$$, 'trop facile');
select pg_temp.expect_error($$select set_member_pin('20000000-0000-0000-0000-000000000003','7777')$$, 'trop facile');
select pg_temp.expect(login_pin('00000000-0000-0000-0000-000000000001','tablette','4827') = '20000000-0000-0000-0000-000000000002', 'Code correct → bon membre');
select login_pin('00000000-0000-0000-0000-000000000001','tablette','0001') from generate_series(1,5);
select pg_temp.expect_error($$select login_pin('00000000-0000-0000-0000-000000000001','tablette','4827')$$, 'Trop de codes faux');
select pg_temp.expect((select pin_hmac is not null and position('4827' in encode(pin_hmac,'escape')) = 0 from member where id='20000000-0000-0000-0000-000000000002'), 'PIN jamais stocké en clair');

-- Seuils
select pg_temp.expect_error($$insert into equipment(company_id,name,type,min_value,max_value) values ('00000000-0000-0000-0000-000000000001','Frigo X','froid_positif',0,6)$$, 'moins strict');
select pg_temp.expect_error($$insert into equipment(company_id,name,type,max_value) values ('00000000-0000-0000-0000-000000000001','Congélo X','froid_negatif',-15)$$, 'moins strict');
select pg_temp.expect_error($$insert into equipment(company_id,name,type,min_value) values ('00000000-0000-0000-0000-000000000001','Bain-marie','maintien_chaud',60)$$, 'moins strict');
insert into equipment(id, company_id, name, type, min_value, max_value) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Frigo (positif)','froid_positif',0,4);

-- Relevés : statut serveur, droits, NC auto, non-modifiable
insert into shift_check(company_id,member_id,apte,tenue_ok,bijoux_ok,mains_ok) values ('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',true,true,true,true);
insert into temperature_reading(company_id,equipment_id,member_id,value,measured_at) values
 ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',3.0,now()),
 ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',3.7,now()),
 ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',7.2,now());
select pg_temp.expect((select array_agg(status order by value) from temperature_reading) = '{vert,jaune,rouge}', 'Statuts vert / jaune / rouge calculés');
select pg_temp.expect((select count(*) from nonconformity) = 1, 'Relevé rouge → NC ouverte automatiquement');
select pg_temp.expect_error($$update temperature_reading set status='vert' where value=7.2$$, 'non modifiable');
select pg_temp.expect_error($$delete from temperature_reading$$, 'non modifiable');
select pg_temp.expect_error($$insert into temperature_reading(company_id,equipment_id,member_id,value,measured_at) values ('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',3,now())$$, 'pas le droit');

-- Non-conformité : clôture contrôlée
select pg_temp.expect_error($$insert into nc_step(nc_id,step,content,member_id) select id,'cloture','ok','20000000-0000-0000-0000-000000000002' from nonconformity$$, 'action corrective et vérification requises');
insert into nc_step(nc_id,step,content,member_id) select id,'action_corrective','Joint vérifié','20000000-0000-0000-0000-000000000002' from nonconformity;
insert into nc_step(nc_id,step,content,member_id) select id,'verification','Relevé 3,8 °C','20000000-0000-0000-0000-000000000002' from nonconformity;
select pg_temp.expect_error($$insert into nc_step(nc_id,step,content,member_id) select id,'cloture','ok','20000000-0000-0000-0000-000000000004' from nonconformity$$, 'non autorisée');
insert into nc_step(nc_id,step,content,member_id) select id,'cloture','Clôturée','20000000-0000-0000-0000-000000000002' from nonconformity;
select pg_temp.expect_error($$update nc_step set content='x'$$, 'non modifiable');

-- Audit
select pg_temp.expect((select count(*) from audit_log where table_name='member') >= 4, 'Journal d''audit des membres');
select pg_temp.expect((select bool_and(not (row_data ? 'pin_hmac')) from audit_log), 'Audit sans données de PIN');
select 'TOUS LES TESTS RÉUSSIS' as resultat;
