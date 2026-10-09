-- Service-role-only, atomic fixed-window request protection (30 requests/10 min).
create table if not exists public.unread_rate_limits (
  subject text primary key,
  window_start timestamptz not null,
  hits integer not null check (hits > 0)
);
alter table public.unread_rate_limits enable row level security;
revoke all on public.unread_rate_limits from public, anon, authenticated;

create or replace function public.unread_consume_rate_limit(p_subject text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hits integer;
begin
  if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate-limit subject';
  end if;
  insert into public.unread_rate_limits as limits (subject, window_start, hits)
  values (p_subject, v_now, 1)
  on conflict (subject) do update set
    hits = case when limits.window_start <= v_now - interval '10 minutes'
      then 1 else limits.hits + 1 end,
    window_start = case when limits.window_start <= v_now - interval '10 minutes'
      then v_now else limits.window_start end
  where limits.window_start <= v_now - interval '10 minutes' or limits.hits < 30
  returning hits into v_hits;
  return v_hits is not null;
end;
$$;
revoke all on function public.unread_consume_rate_limit(text) from public, anon, authenticated;
grant execute on function public.unread_consume_rate_limit(text) to service_role;
