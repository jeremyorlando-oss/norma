-- Tests 005 : fonctions ajoutées depuis l'audit (tablette puis iPhone du Gérant).
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

-- ===== Tablette
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000000a', false);
create temp table s as select norma.rpc_ouvrir('4827') as j;
create temp table tk as select ((select j from s)->>'token')::uuid as t;
select pg_temp.expect((select (j->>'prenom') = 'Esteban' and (j->>'privacyAck')::boolean = false and (j->>'trained')::boolean = false from s), 'Ouverture : session JSON complète');
select norma.rpc_notice_lue((select t from tk), '2026-10-25');
select pg_temp.expect(not norma.rpc_formation((select t from tk), 4), 'Quiz 4/5 : refusé');
select pg_temp.expect(norma.rpc_formation((select t from tk), 5), 'Quiz 5/5 : validé');
select norma.rpc_fermer_session((select t from tk));
drop table s; create temp table s as select norma.rpc_ouvrir('4827') as j;
update tk set t = ((select j from s)->>'token')::uuid;
select pg_temp.expect((select (j->>'privacyAck')::boolean and (j->>'trained')::boolean and not (j->>'arrivee')::boolean from s), 'Notice lue et formation enregistrées');

-- Pauses (OLT 1 art. 73)
select norma.rpc_pause((select t from tk), true);
select pg_temp.expect_error($$select norma.rpc_pause((select t from tk), true)$$, 'Déjà en pause');
select pg_temp.expect((norma.rpc_ouvrir('4827')->>'onBreak')::boolean, 'Pause visible à l''ouverture de session');
select norma.rpc_pause((select t from tk), false);
select pg_temp.expect_error($$select norma.rpc_pause((select t from tk), false)$$, 'Pas en pause');

-- Checklists, maintien au chaud, produits entamés
select pg_temp.expect(norma.rpc_checklist((select t from tk), 'ouverture', '{"a":true,"b":false}', '{"a":"Savon","b":"Nuisibles"}') = 1, 'Checklist : 1 point à NON → 1 incident');
select pg_temp.expect(norma.rpc_checklist_faite('ouverture'), 'Checklist d''ouverture faite aujourd''hui');
select pg_temp.expect(not norma.rpc_checklist_faite('fermeture'), 'Checklist de fermeture pas encore faite');
select norma.rpc_chaud_debut((select t from tk), 'Saucisses volaille');
select pg_temp.expect(jsonb_array_length(norma.rpc_bacs_chauds()) = 1, 'Bac au chaud enregistré');
select norma.rpc_chaud_fin((select t from tk), ((norma.rpc_bacs_chauds()->0)->>'id')::uuid, 'vendu');
select pg_temp.expect_error($$select norma.rpc_chaud_fin((select t from tk), ((norma.rpc_bacs_chauds()->0)->>'id')::uuid, 'jete')$$, 'Déjà terminé');
create temp table op as select norma.rpc_produit_entame((select t from tk), 'Mayonnaise', 3) as j;
select pg_temp.expect((select j->>'lotCode' like 'Ouvert le %' and j->>'kind' = 'ouvert' from op), 'Produit entamé : étiquette « ouvert le »');
select norma.rpc_jeter((select t from tk), ((select j from op)->>'id')::uuid);
select pg_temp.expect_error($$select norma.rpc_jeter((select t from tk), ((select j from op)->>'id')::uuid)$$, 'déjà jeté');

-- Coupure de courant → minuteur, puis relevés exigés
select norma.rpc_signaler2((select t from tk), 'coupure_courant', 'Plus de courant');
select pg_temp.expect(norma.rpc_coupure()->>'end' is null, 'Coupure en cours');
select norma.rpc_courant_retabli((select t from tk));
select pg_temp.expect(norma.rpc_coupure()->>'end' is not null, 'Courant rétabli enregistré');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_alertes(now() + interval '1 minute')) a where a->>'title' like 'Relevé après coupure%'), 'Alerte : relevé après coupure');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_incidents()) n where n->>'kind' = 'Coupure de courant'
  and jsonb_array_length(n->'steps') = 1), 'Incident coupure : durée ajoutée');

-- Relevé hors seuil avec actions immédiates ; nettoyage avec le produit du plan
reset role;
insert into norma.equipment(id, company_id, name, type, min_value, max_value) values ('30000000-0000-0000-0000-0000000000f5','00000000-0000-0000-0000-000000000001','Frigo 5','froid_positif',0,4);
set role authenticated;
select pg_temp.expect(norma.rpc_releve2((select t from tk), '30000000-0000-0000-0000-0000000000f5', 7.5, array['Produits isolés','Responsable averti']) = 'rouge', 'Relevé hors seuil → rouge');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_incidents()) n where n->>'description' like 'Frigo 5%'
  and n->'steps'->0->>'content' = 'Produits isolés · Responsable averti'), 'Actions immédiates notées sur l''incident');
select norma.rpc_nettoyage2((select t from tk), (select (i->>'id')::uuid from jsonb_array_elements(norma.rpc_lire_nettoyage(now())) i where i->>'name' = 'Frigo 5'));
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_lire_nettoyage(now())) i where i->>'name' = 'Frigo 5' and i->'lastDone'->>'by' = 'Esteban'), 'Nettoyage validé');

-- Lectures
select pg_temp.expect(not exists (select 1 from jsonb_array_elements(norma.rpc_lire_materiel()) e where e->>'name' = 'Frigo étranger'), 'Matériel : autre entreprise invisible');
select pg_temp.expect(jsonb_array_length(norma.rpc_lire_nettoyage(now())) > 0, 'Plan de nettoyage lisible');
select pg_temp.expect(jsonb_array_length(norma.rpc_lots(now())) > 0, 'Lots lisibles');
select pg_temp.expect(jsonb_array_length(norma.rpc_equipe()) >= 4, 'Équipe lisible');
select pg_temp.expect(norma.rpc_rapport_jour(norma.today_ch()) ?& array['company','readings','oil','receptions','cleaning','lots','ncs','attendance'], 'Rapport du jour complet');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_rapport_jour(norma.today_ch())->'attendance') a where a->>'name' = 'Esteban' and a->>'pauses' <> ''), 'Rapport : pauses présentes');
select pg_temp.expect((norma.rpc_stats_jour(now()) ? 'nettoyagesEnRetard'), 'Statistiques du jour');
select pg_temp.expect_error($$select norma.rpc_heures(now() - interval '1 day', now())$$, 'Accès refusé');
-- Caisse : pas d'étiquetage de produit entamé
create temp table s2 as select norma.rpc_ouvrir('5913') as j;
select pg_temp.expect_error($$select norma.rpc_produit_entame(((select j from s2)->>'token')::uuid, 'Ketchup', 3)$$, 'pas le droit');

-- ===== iPhone du Gérant
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect(norma.rpc_moi()->>'kind' = 'direction', 'iPhone du Gérant reconnu');
select pg_temp.expect_error($$select norma.rpc_materiel(null, 'Frigo test', 'froid_positif', 0, 6)$$, 'moins strict');
select pg_temp.expect_error($$select norma.rpc_materiel(null, 'Four', 'cuisson', 65, null)$$, 'moins strict');
create temp table eq as select norma.rpc_materiel(null, 'Frigo boissons', 'froid_positif', 0, 4) as id;
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_lire_nettoyage(now())) i where i->>'name' = 'Frigo boissons'), 'Nouveau matériel → tâche de nettoyage créée');
select norma.rpc_materiel_retirer((select id from eq));
select pg_temp.expect(not exists (select 1 from jsonb_array_elements(norma.rpc_lire_materiel()) e where e->>'name' = 'Frigo boissons'), 'Matériel retiré (archivé)');
select norma.rpc_tache_nettoyage(null, 'Zone caisse', 'Désinfectant · 2 % · gants', 'Toutes les 2 h', 120);
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_lire_nettoyage(now())) i where i->>'name' = 'Zone caisse' and i->>'frequency' = 'Toutes les 2 h' and i->>'dueAt' is not null), 'Tâche du plan avec rappel');
select norma.rpc_droits_poste('Aide de cuisine', array['releves']::norma.right_code[]);
select pg_temp.expect((norma.rpc_postes()->'Aide de cuisine') @> '["pointage","prise_poste","signaler_nc","releves"]', 'Droits de poste : socle toujours actif');
select pg_temp.expect_error($$select norma.rpc_droits_poste('Gérant', array['releves']::norma.right_code[])$$, 'ne se modifient pas');
select norma.rpc_droits_membre('20000000-0000-0000-0000-000000000004', array['reception']::norma.right_code[]);
select pg_temp.expect(norma.rpc_droits_individuels() ? '20000000-0000-0000-0000-000000000004', 'Droit en plus pour une personne');
select pg_temp.expect(norma.rpc_ajouter_membre('Lucía', 'R', 'Aide de cuisine', 'es') ~ '^\d{4}$', 'Nouveau membre : code à 4 chiffres');
select pg_temp.expect(norma.rpc_nouveau_code('20000000-0000-0000-0000-000000000003') ~ '^\d{4}$', 'Nouveau code généré');
create temp table ev as select norma.rpc_evenement(null, 'Festival test', 'Lausanne', norma.today_ch() - 1, norma.today_ch() + 1, 'Asso', '', 'Électricité 16 A',
  array['20000000-0000-0000-0000-000000000002']::uuid[], array[]::uuid[]) as id;
select pg_temp.expect(norma.rpc_evenement_courant(norma.today_ch())->>'name' = 'Festival test', 'Événement en cours');
select pg_temp.expect((norma.rpc_rapport_jour(norma.today_ch())->>'event') like 'Festival test · Lausanne · jour 2/3', 'Rapport : nom de l''événement et jour');
select pg_temp.expect((norma.rpc_bilan_evenement((select id from ev), now())->>'releves')::int >= 0, 'Bilan d''événement');
select pg_temp.expect_error($$select norma.rpc_evenement_supprimer((select id from ev))$$, 'suppression impossible');

-- Heures : correction tracée, motif obligatoire
create temp table sh as select norma.rpc_heures(now() - interval '1 day', now() + interval '1 hour') as j;
select pg_temp.expect(jsonb_array_length((select j from sh)) > 0, 'Heures de l''équipe lisibles');
create temp table arr as select (x->>'id')::uuid as id, (x->>'start')::timestamptz as st from jsonb_array_elements((select j from sh)) x where x->>'prenom' = 'Esteban' limit 1;
select pg_temp.expect_error($$select norma.rpc_correction_heures((select id from arr), (select st from arr), (select st from arr) + interval '8 hours', '[]', '')$$, 'motif');
select pg_temp.expect_error($$select norma.rpc_correction_heures((select id from arr), (select st from arr), (select st from arr) - interval '1 hour', '[]', 'oubli')$$, 'après l’arrivée');
select norma.rpc_correction_heures((select id from arr), (select st from arr), (select st from arr) + interval '8 hours', '[]', 'A oublié de dépointer');
select pg_temp.expect(exists (select 1 from jsonb_array_elements(norma.rpc_heures(now() - interval '1 day', now() + interval '9 hours')) x
  where (x->>'id')::uuid = (select id from arr) and jsonb_array_length(x->'corrections') = 1 and x->>'end' is not null and x->'corrections'->0->>'what' like 'départ en service → %'), 'Correction : nouvelle valeur + historique');
select pg_temp.expect(jsonb_typeof(norma.rpc_alertes_heures(now())) = 'array', 'Alertes d''oubli de dépointage');

-- Inspecteur et journal
create temp table ins as select norma.rpc_inspecteur_ouvrir() as j;
select pg_temp.expect(norma.rpc_inspecteur_jour(((select j from ins)->>'token')::uuid, norma.today_ch()) ? 'readings', 'Inspecteur : registres du jour');
select pg_temp.expect(norma.rpc_inspecteur_info(((select j from ins)->>'token')::uuid) ? 'trainings', 'Inspecteur : formations et documents');
select norma.rpc_inspecteur_fermer(((select j from ins)->>'token')::uuid);
select pg_temp.expect_error($$select norma.rpc_inspecteur_jour(((select j from ins)->>'token')::uuid, norma.today_ch())$$, 'expiré');
select pg_temp.expect(jsonb_array_length(norma.rpc_journal()) >= 3, 'Journal des accès inspecteur');
select norma.rpc_revue_haccp();
select pg_temp.expect(norma.rpc_derniere_revue() is not null, 'Revue du plan HACCP');
select pg_temp.expect(jsonb_array_length(norma.rpc_lectures_notice()) >= 1, 'Lectures de la notice LPD');
select pg_temp.expect(jsonb_array_length(norma.rpc_documents()) = 7, 'Documents du stand');

-- Fonctions internes non appelables directement
select pg_temp.expect_error($$select norma.new_pin('20000000-0000-0000-0000-000000000003')$$, 'permission denied');
reset role;
select 'TOUS LES TESTS 005 RÉUSSIS' as resultat;
