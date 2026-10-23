-- NORMA · relier les comptes de connexion (créés dans Supabase › Authentication › Users) à NORMA.
-- Remplace les deux adresses e-mail ci-dessous par celles que tu as créées, puis Run.
set search_path = norma, public, extensions;

-- 1. La tablette du stand (compte partagé, reste connecté sur la tablette)
insert into device(company_id, name, auth_user_id)
select '00000000-0000-0000-0000-0000000000c1', 'Tablette stand', id from auth.users where email = 'TABLETTE@EXEMPLE.CH'
on conflict (auth_user_id) do nothing;

-- 2. Ton iPhone (espace Direction du Gérant)
update member set auth_user_id = (select id from auth.users where email = 'TON-EMAIL@EXEMPLE.CH')
where id = '00000000-0000-0000-0000-0000000000b1';

select (select count(*) from device) as tablettes,
       (select count(*) from member where auth_user_id is not null) as comptes_direction;
