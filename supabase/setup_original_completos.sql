-- NORMA · données de départ : entreprise, postes et compte du Gérant.
-- AVANT DE LANCER : remplace 0000 (ligne « set_member_pin ») par TON code à 4 chiffres.
-- Codes refusés : 4 chiffres identiques (7777) ou qui se suivent (1234, 9876).
set search_path = norma, public, extensions;

insert into company(id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Original''s Completos') on conflict do nothing;

insert into poste(id, company_id, name, rights, is_owner) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Gérant','{}',true),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1','Manager',
   '{pointage,prise_poste,nettoyage,signaler_nc,allergenes_lecture,releves,reception,preparations,jeter_lot,traiter_nc,cloturer_nc,tableau_bord,heures_equipe,export,equipements,gestion_equipe,admin_documents}',false),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1','Chef de cuisine',
   '{pointage,prise_poste,nettoyage,signaler_nc,allergenes_lecture,releves,reception,preparations,jeter_lot,traiter_nc,cloturer_nc,tableau_bord}',false),
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000c1','Aide de cuisine',
   '{pointage,prise_poste,nettoyage,signaler_nc}',false),
 ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000c1','Caisse',
   '{pointage,prise_poste,nettoyage,signaler_nc,allergenes_lecture}',false)
on conflict do nothing;

insert into member(id, company_id, poste_id, first_name, last_name, lang) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','Orlando','Quispe Oscco','fr')
on conflict do nothing;

select set_member_pin('00000000-0000-0000-0000-0000000000b1', '0000');

select 'Installation terminée' as resultat, (select count(*) from poste) as postes, (select count(*) from member) as membres;
