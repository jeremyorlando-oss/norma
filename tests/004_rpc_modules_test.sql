-- Tests des fonctions d'action (tablette) pour huile, réception, préparations, lots, NC.
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

set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000a', false);
create temp table chef as select * from norma.rpc_ouvrir_session('4827');     -- Esteban, chef de cuisine
create temp table caisse as select * from norma.rpc_ouvrir_session('5913');   -- Caisse (nouvelle arrivée)

select pg_temp.expect((select not must_change from norma.rpc_huile((select token from chef),'30000000-0000-0000-0000-000000000009','service',168,null,'{}',false,false)), 'Huile : contrôle de service via tablette');
select pg_temp.expect_error($$select norma.rpc_huile((select token from caisse),'30000000-0000-0000-0000-000000000009','service',168,null,'{}',false,false)$$, 'pas le droit');
select pg_temp.expect_error($$select norma.rpc_huile((select token from chef),'30000000-0000-0000-0000-0000000000ff','service',168,null,'{}',false,false)$$, 'Élément inconnu');

select norma.rpc_reception((select token from chef),'Carnadis','Saucisse volaille','L77',current_date+6,2.9,true,true,true,true,true,null,'bons/2026-10-22-1.jpg',true,'7610000000001');
select pg_temp.expect((select name = 'Saucisse volaille' from norma.rpc_produit_scanne((select token from chef),'7610000000001')), 'Code-barres mémorisé dans le catalogue interne');

select pg_temp.expect((select lot_code like 'JAL-%' from norma.rpc_preparation((select token from chef),'50000000-0000-0000-0000-000000000001')), 'Préparation → lot JAL créé');
select pg_temp.expect_error($$select norma.rpc_preparation((select token from caisse),'50000000-0000-0000-0000-000000000001')$$, 'pas le droit');

create temp table nc as select norma.rpc_signaler((select token from caisse),'corps_etranger','Client : morceau de plastique dans un completo') as id;
select pg_temp.expect((select id is not null from nc), 'Caisse peut signaler un problème');
select pg_temp.expect_error($$select norma.rpc_nc_etape((select token from caisse),(select id from nc),'action_corrective','x')$$, 'Traitement non autorisé');
select norma.rpc_nc_etape((select token from chef),(select id from nc),'mesure_immediate','Produit retiré, lot isolé');
reset role;
select 'TOUS LES TESTS MODULES RÉUSSIS' as resultat;
