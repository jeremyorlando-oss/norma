-- NORMA · matériel et plan de nettoyage de départ (Original's Completos), à adapter ensuite dans Réglages.
-- À lancer UNE FOIS, après install_supabase.sql, setup_original_completos.sql et 005_audit_v1.sql.
-- Les seuils internes sont plus stricts que les limites officielles (le serveur refuse l'inverse).
-- Les dosages « [dosage étiquette] » sont à remplacer par ceux des étiquettes des produits de nettoyage.
set search_path = norma, public, extensions;

do $$
declare c uuid := '00000000-0000-0000-0000-0000000000c1';
begin
  if exists (select 1 from equipment where company_id = c) then
    raise notice 'Matériel déjà présent : rien n''est ajouté';
    return;
  end if;
  insert into equipment(company_id, name, type, min_value, max_value) values
    (c, 'Frigo (positif)', 'froid_positif', 0, 4),
    (c, 'Congélateur', 'froid_negatif', null, -18),
    (c, 'Saladette', 'froid_positif', 2, 4),
    (c, 'Réchauffe à cœur (saucisses)', 'cuisson', 72, null),
    (c, 'Maintien au chaud', 'maintien_chaud', 65, null),
    (c, 'Friteuse 1', 'friteuse', null, 175);
  -- tâches créées automatiquement pour chaque matériel : produits et fréquences précisés
  update cleaning_item set product = 'Désinfectant alimentaire · [dosage étiquette]', label = 'Montage, démontage et 1× par semaine ; poignées et joints chaque jour'
    where company_id = c and name in ('Frigo (positif)', 'Congélateur', 'Saladette');
  update cleaning_item set product = 'Produit spécial friture · gants + lunettes', label = 'À chaque changement d’huile ; extérieur chaque soir'
    where company_id = c and name = 'Friteuse 1';
  update cleaning_item set product = 'Dégraissant + désinfectant alimentaire · [dosage étiquette]', label = 'Fin de service'
    where company_id = c and name in ('Réchauffe à cœur (saucisses)', 'Maintien au chaud');
  insert into cleaning_item(company_id, name, kind, product, frequency, interval_minutes, label) values
    (c, 'Zone caisse et service', 'zone', 'Désinfectant alimentaire · [dosage étiquette] · gants', 'intervalle', 120, 'Toutes les 2 h'),
    (c, 'Sol', 'zone', 'Détergent + désinfectant · [dosage étiquette] · gants', 'intervalle', 120, 'Fin de service et dès salissure'),
    (c, 'Poubelles et containers', 'zone', 'Désinfectant détergent · gants', 'intervalle', 360, 'Dès ¾ pleines et en fin de service'),
    (c, 'Plans de travail inox', 'zone', 'Désinfectant alimentaire · [temps de contact étiquette]', 'libre', null, 'À chaque changement de tâche'),
    (c, 'Ustensiles et pinces', 'zone', 'Détergent + désinfectant', 'libre', null, 'Après utilisation'),
    (c, 'Sonde du thermomètre', 'zone', 'Lingette désinfectante alimentaire', 'libre', null, 'Avant chaque mesure'),
    (c, 'Lave-mains', 'zone', 'Détergent · gants', 'libre', null, '1× par jour'),
    (c, 'Bacs et contenants', 'zone', 'Détergent + désinfectant', 'libre', null, 'À chaque vidage'),
    (c, 'Tablette NORMA', 'zone', 'Lingette désinfectante', 'libre', null, 'Début et fin de service');
end $$;

select (select count(*) from equipment where company_id = '00000000-0000-0000-0000-0000000000c1') as materiel,
       (select count(*) from cleaning_item where company_id = '00000000-0000-0000-0000-0000000000c1') as taches_nettoyage;
