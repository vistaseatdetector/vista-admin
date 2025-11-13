do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mass_occurrences'
      and column_name = 'people_count'
  ) then
    alter table public.mass_occurrences
      add column people_count integer;
  end if;
end$$;
