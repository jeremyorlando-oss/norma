-- NORMA 011 — pièce d'identité suisse : pas de permis, donc pas de date de validité.
-- Une date « permis valable jusqu'au » n'est gardée que pour un vrai permis (B, C, L, G…).
set search_path = norma, public, extensions;

create or replace function member_profile_permis() returns trigger language plpgsql as $$
begin
  if coalesce(new.permit, '') in ('', 'CH') then new.permit_until := null; end if;
  return new;
end $$;

drop trigger if exists member_profile_permis on member_profile;
create trigger member_profile_permis before insert or update on member_profile
  for each row execute function member_profile_permis();

update member_profile set permit_until = null where coalesce(permit, '') in ('', 'CH') and permit_until is not null;
