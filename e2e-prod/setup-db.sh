#!/bin/sh
# Base locale qui imite Supabase pour tester l'app de production de bout en bout (PostgREST + faux service de connexion).
set -e
cd "$(dirname "$0")/.."
DB=normae2e
su postgres -c "psql -q -d postgres -c \"select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB'\"" >/dev/null
su postgres -c "dropdb --if-exists $DB; createdb $DB"
su postgres -c "psql -q -d $DB -c 'create schema extensions; create extension pgcrypto with schema extensions;'"
su postgres -c "psql -q -d postgres" <<'SQL' >/dev/null 2>&1 || true
create role anon nologin;
create role authenticated nologin;
create role authenticator login password 'test' noinherit;
create role service_role nologin bypassrls;
SQL
su postgres -c "psql -q -d postgres -c 'grant anon, authenticated, service_role to authenticator'" >/dev/null 2>&1 || true
for f in supabase/migrations/00[1-8]*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f" >/dev/null; done
sed "s/'0000');/'2580');/" supabase/setup_original_completos.sql | su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" >/dev/null
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f supabase/seed_materiel_nettoyage.sql" >/dev/null
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" <<'SQL' >/dev/null
-- PostgREST récent transmet l'identité dans request.jwt.claims (comme Supabase)
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub'))::uuid $f$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
set search_path = norma, public, extensions;
update company set address = 'Bussigny, Suisse', phone = '078 352 12 02', email = 'info@originalscompletos.ch', responsable = 'Orlando Quispe Oscco';
insert into auth.users(id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','tablette@test.ch'), ('aaaaaaaa-0000-0000-0000-000000000002','orlando@test.ch');
grant usage on schema auth to service_role;
insert into device(company_id, name, auth_user_id) values ('00000000-0000-0000-0000-0000000000c1', 'Tablette stand', 'aaaaaaaa-0000-0000-0000-000000000001');
update member set auth_user_id = 'aaaaaaaa-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-0000000000b1';
insert into member(id, company_id, poste_id, first_name, last_name, lang) values
 ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a3','Esteban','Q','fr'),
 ('00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a4','Lucía','R','es');
select set_member_pin('00000000-0000-0000-0000-0000000000b3','4827');
select set_member_pin('00000000-0000-0000-0000-0000000000b4','6142');
insert into recipe(company_id, name, code, shelf_days, allergens) values
 ('00000000-0000-0000-0000-0000000000c1','Sauce Original''s','ORI',2,'{oeufs,moutarde}'),
 ('00000000-0000-0000-0000-0000000000c1','Sauce jalapeños','JAL',2,'{oeufs,moutarde}');
insert into dish(company_id, name, ingredients, allergens, meat_origin) values
 ('00000000-0000-0000-0000-0000000000c1','Completo test','{Pain,Saucisse}','{gluten}','Volaille : Suisse (exemple)');
SQL
echo "Base $DB prête"
