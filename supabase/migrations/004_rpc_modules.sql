-- NORMA — fonctions d'action pour huile, réception, préparations, lots, non-conformités.
-- Même modèle que 003 : acteur vérifié (session tablette ou iPhone Direction), droits contrôlés par les déclencheurs.
set search_path = norma, public, extensions;

create or replace function own_row(p_company uuid, p_table regclass, p_id uuid) returns void language plpgsql security definer as $$
declare ok boolean;
begin
  execute format('select exists(select 1 from %s where id = $1 and company_id = $2)', p_table) into ok using p_id, p_company;
  if not ok then raise exception 'Élément inconnu'; end if;
end $$;

create or replace function rpc_huile(p_token uuid, p_equipment uuid, p_moment text, p_temperature numeric,
  p_polar numeric, p_defects text[], p_filtered boolean, p_changed boolean)
returns table(id uuid, must_change boolean) language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'equipment', p_equipment);
  return query insert into oil_check(company_id, equipment_id, member_id, moment, temperature, polar_pct, defects, filtered, changed)
    values (a.company_id, p_equipment, a.member_id, p_moment, p_temperature, p_polar, coalesce(p_defects, '{}'), p_filtered, p_changed)
    returning oil_check.id, oil_check.must_change;
end $$;

create or replace function rpc_reception(p_token uuid, p_supplier text, p_product text, p_lot text, p_dlc date,
  p_temperature numeric, p_packaging boolean, p_aspect boolean, p_order boolean, p_cold boolean,
  p_accepted boolean, p_refusal text, p_photo text, p_autofilled boolean, p_barcode text default null)
returns uuid language plpgsql security definer as $$
declare a record; rid uuid;
begin
  select * into a from actor(p_token);
  insert into reception(company_id, member_id, supplier, product, supplier_lot, dlc, temperature, packaging_ok, aspect_ok,
    order_ok, cold_chain_ok, accepted, refusal_reason, delivery_note_path, autofilled)
  values (a.company_id, a.member_id, p_supplier, p_product, p_lot, p_dlc, p_temperature, p_packaging, p_aspect,
    p_order, p_cold, p_accepted, p_refusal, p_photo, p_autofilled)
  returning id into rid;
  -- catalogue interne (D26) : le produit scanné est mémorisé
  if p_barcode is not null then
    insert into product_catalog(company_id, barcode, name, supplier) values (a.company_id, p_barcode, p_product, p_supplier)
    on conflict (company_id, barcode) do nothing;
  end if;
  return rid;
end $$;

create or replace function rpc_produit_scanne(p_token uuid, p_barcode text) returns table(name text, supplier text)
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  return query select c.name, c.supplier from product_catalog c where c.company_id = a.company_id and c.barcode = p_barcode;
end $$;

create or replace function rpc_preparation(p_token uuid, p_recipe uuid) returns table(lot_code text, use_by date)
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'recipe', p_recipe);
  return query insert into prep_lot(company_id, recipe_id, member_id) values (a.company_id, p_recipe, a.member_id)
    returning prep_lot.lot_code, prep_lot.use_by;
end $$;

create or replace function rpc_jeter_lot(p_token uuid, p_lot uuid) returns void language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'prep_lot', p_lot);
  insert into lot_disposal(lot_id, member_id) values (p_lot, a.member_id);
end $$;

create or replace function rpc_signaler(p_token uuid, p_kind text, p_description text) returns uuid
language plpgsql security definer as $$
declare a record; nid uuid;
begin
  select * into a from actor(p_token);
  if not has_right(a.member_id, 'signaler_nc') then raise exception 'Ce poste ne peut pas signaler'; end if;
  insert into nonconformity(company_id, kind, description, opened_by) values (a.company_id, p_kind, p_description, a.member_id)
  returning id into nid;
  return nid;
end $$;

create or replace function rpc_nc_etape(p_token uuid, p_nc uuid, p_step text, p_content text) returns void
language plpgsql security definer as $$
declare a record;
begin
  select * into a from actor(p_token);
  perform own_row(a.company_id, 'nonconformity', p_nc);
  insert into nc_step(nc_id, step, content, member_id) values (p_nc, p_step, p_content, a.member_id);
end $$;

grant execute on function
  rpc_huile(uuid, uuid, text, numeric, numeric, text[], boolean, boolean),
  rpc_reception(uuid, text, text, text, date, numeric, boolean, boolean, boolean, boolean, boolean, text, text, boolean, text),
  rpc_produit_scanne(uuid, text), rpc_preparation(uuid, uuid), rpc_jeter_lot(uuid, uuid),
  rpc_signaler(uuid, text, text), rpc_nc_etape(uuid, uuid, text, text) to authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'norma' and p.prosecdef loop
    execute format('alter function %s set search_path = norma, public, extensions', f.sig);
  end loop;
end $$;
