-- Tests 006 : espace Employé, invitations, documents, rapport du soir, notifications.
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
insert into auth.users(id, email) values ('a0000000-0000-0000-0000-000000000001', 'orlando@test.ch') on conflict do nothing;
create temp table v(k text primary key, val text);
grant all on v to authenticated;

-- ===== Gérant (iPhone) : invitation de l'Aide
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
insert into v values ('tok', norma.rpc_inviter('20000000-0000-0000-0000-000000000003'));
select pg_temp.expect(length((select val from v where k = 'tok')) = 48, 'Invitation : lien généré');
select pg_temp.expect((select (x->>'invitationJusqua') is not null and not (x->>'compte')::boolean from jsonb_array_elements(norma.rpc_comptes()) x
  where x->>'memberId' = '20000000-0000-0000-0000-000000000003'), 'Équipe : invitation en attente visible');
select pg_temp.expect_error($$select norma.invitation_valide('x')$$, 'permission denied');
reset role;

-- ===== Fonction serveur : acceptation (clé secrète)
select pg_temp.expect(invitation_valide('faux') is null, 'Lien inconnu refusé');
select pg_temp.expect(invitation_valide((select val from v where k = 'tok'))->>'prenom' = 'Aide', 'Lien valide : prénom de la personne');
insert into auth.users(id, email) values ('e0000000-0000-0000-0000-000000000003', 'aide@test.ch');
select invitation_utiliser((select val from v where k = 'tok'), 'e0000000-0000-0000-0000-000000000003');
select pg_temp.expect_error($$select norma.invitation_utiliser((select val from v where k = 'tok'), 'e0000000-0000-0000-0000-000000000099')$$, 'expirée');
select pg_temp.expect(invitation_valide((select val from v where k = 'tok')) is null, 'Lien à usage unique');

-- ===== Employé connecté sur son téléphone
set role authenticated;
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000003', false);
select pg_temp.expect(norma.rpc_moi()->>'kind' = 'employee', 'Compte Employé reconnu');
select pg_temp.expect(norma.rpc_employe_moi()->>'prenom' = 'Aide', 'Employé : son profil');
select pg_temp.expect(norma.my_company() is null, 'Employé : aucune donnée de l''entreprise');
select pg_temp.expect((select count(*) from norma.equipment) = 0 and (select count(*) from norma.time_entry) = 0, 'Employé : tables de l''entreprise invisibles');
select pg_temp.expect(jsonb_array_length(norma.rpc_evenements()) = 0 and jsonb_array_length(norma.rpc_journal()) = 0, 'Employé : pas d''accès aux écrans Direction');
select pg_temp.expect_error($$select norma.rpc_heures(now() - interval '1 day', now())$$, 'non autorisées');
select pg_temp.expect_error($$select norma.rpc_inviter('20000000-0000-0000-0000-000000000004')$$, 'non autorisée');
select pg_temp.expect(jsonb_typeof(norma.rpc_mes_heures(now() - interval '30 days', now() + interval '1 day')) = 'array', 'Employé : ses heures');
select pg_temp.expect(jsonb_typeof(norma.rpc_mon_planning()) = 'array', 'Employé : son planning');
select norma.rpc_ma_langue('es');
select pg_temp.expect(norma.rpc_employe_moi()->>'langue' = 'es', 'Employé : choix de la langue');
select pg_temp.expect_error($$select norma.rpc_document_ajoute('identite', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000004/identite/x.pdf', 'x.pdf')$$, 'refusé');
select norma.rpc_document_ajoute('identite', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000003/identite/a.pdf', 'Permis.pdf');
select norma.rpc_document_ajoute('certificat_medical', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000003/certificat_medical/b.pdf', 'Certificat.pdf');
select pg_temp.expect(jsonb_array_length(norma.rpc_mes_documents()) = 2, 'Employé : ses documents déposés');

-- ===== Direction : documents, retrait d'accès
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.expect(jsonb_array_length(norma.rpc_documents_membre('20000000-0000-0000-0000-000000000003')) = 2, 'Gérant : voit aussi le certificat médical');
select pg_temp.expect((select (x->>'compte')::boolean and (x->>'documents')::int = 2 from jsonb_array_elements(norma.rpc_comptes()) x
  where x->>'memberId' = '20000000-0000-0000-0000-000000000003'), 'Équipe : compte actif et documents');
select pg_temp.expect_error($$select norma.rpc_inviter('20000000-0000-0000-0000-000000000003')$$, 'déjà un compte');
select norma.rpc_document_supprimer(((norma.rpc_documents_membre('20000000-0000-0000-0000-000000000003')->0)->>'id')::uuid);
select pg_temp.expect(jsonb_array_length(norma.rpc_documents_membre('20000000-0000-0000-0000-000000000003')) = 1, 'Gérant : suppression d''un document');
select pg_temp.expect_error($$select norma.rpc_retirer_acces('20000000-0000-0000-0000-000000000001')$$, 'propre accès');
select norma.rpc_retirer_acces('20000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000003', false);
select pg_temp.expect(norma.rpc_moi()->>'kind' = 'none', 'Accès retiré : compte non relié');

-- ===== Rapport du soir et notifications (Gérant)
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select norma.rpc_heure_rapport(7);
select pg_temp.expect((norma.rpc_rapports_envoyes()->>'hour')::int = 7, 'Heure d''envoi du rapport réglable');
select norma.rpc_push_abonner('https://push.example/abc', 'cle', 'auth');
select pg_temp.expect(norma.rpc_push_actif(), 'Notifications activées sur l''iPhone');
select pg_temp.expect_error($$select norma.push_a_envoyer(now())$$, 'permission denied');
reset role;

select pg_temp.expect(jsonb_array_length(direction_emails('00000000-0000-0000-0000-000000000001')) = 1, 'Rapport : destinataire = Gérant');
-- un jour d'activité hier → un rapport à envoyer à partir de l'heure choisie
insert into member(id, company_id, poste_id, first_name, last_name) values ('20000000-0000-0000-0000-000000000066','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','Hier','H');
insert into time_entry(company_id, member_id, kind, at) values ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000066', 'arrivee', day_start(today_ch() - 1) + interval '10 hours');
select pg_temp.expect(jsonb_array_length(rapports_a_envoyer(((today_ch()::timestamp + interval '6 hours 30 minutes') at time zone 'Europe/Zurich'))) = 0, 'Rapport : pas avant l''heure choisie');
select pg_temp.expect(jsonb_array_length(rapports_a_envoyer(((today_ch()::timestamp + interval '7 hours 5 minutes') at time zone 'Europe/Zurich'))) = 1, 'Rapport : à envoyer à l''heure choisie');
select pg_temp.expect((rapports_a_envoyer(((today_ch()::timestamp + interval '7 hours 5 minutes') at time zone 'Europe/Zurich'))->0->'report') ? 'readings', 'Rapport : contenu complet');
select rapport_envoye('00000000-0000-0000-0000-000000000001', today_ch() - 1, 1);
select pg_temp.expect(jsonb_array_length(rapports_a_envoyer(((today_ch()::timestamp + interval '8 hours') at time zone 'Europe/Zurich'))) = 0, 'Rapport : envoyé une seule fois');

insert into nonconformity(company_id, kind, description, opened_by) values ('00000000-0000-0000-0000-000000000001', 'corps_etranger', 'Cheveu dans une sauce', '20000000-0000-0000-0000-000000000004');
create temp table p as select push_a_envoyer(now()) as j;
select pg_temp.expect((select count(*) from jsonb_array_elements((select j from p)) x where x->>'body' like '%Cheveu%'
  and jsonb_array_length(x->'to') = 1) = 1, 'Notification : nouvel incident vers l''iPhone du Gérant');
select pg_temp.expect((select count(*) from jsonb_array_elements((select j from p)) x where x->>'title' like 'Rapport HACCP%') = 1, 'Notification : rapport envoyé');
select pg_temp.expect((select count(*) from jsonb_array_elements(push_a_envoyer(now())) x where x->>'body' like '%Cheveu%') = 0, 'Notification : envoyée une seule fois');
select pg_temp.expect(cron_verifier((select secret from cron_secret)) and not cron_verifier('faux'), 'Secret des tâches automatiques');
select 'TOUS LES TESTS 006 RÉUSSIS' as resultat;
