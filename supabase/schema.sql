-- Coglio Proxy Archive · Codighel ID (tappa 1), amici (tappa 2) e tavoli condivisi (tappa 4)
--
-- Si incolla UNA volta nel «SQL Editor» di Supabase e si preme Run (si può rilanciare senza danni).
-- Niente account, niente email: ogni profilo ha un ID (il nome utente) e un codice di recupero lungo e casuale
-- che l'app genera sul dispositivo. Sul server resta solo l'impronta (SHA-256) del codice, mai il codice.
--
-- La tabella è chiusa a chiunque (nessun accesso diretto, nemmeno in lettura): tutto passa dalle funzioni qui sotto,
-- che controllano il codice di recupero prima di cambiare qualcosa. La chiave «anon» dell'app può solo chiamarle.

create table if not exists public.cpa_profiles (
  id          uuid primary key default gen_random_uuid(),
  handle      text not null,                 -- come lo ha scritto l'utente (maiuscole comprese)
  handle_key  text not null unique,          -- minuscolo: «Simone» e «simone» sono lo stesso ID
  secret_hash text not null,
  avatar_name text not null default '',      -- nome della carta
  avatar_url  text not null default '',      -- artwork su cards.scryfall.io
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now(),
  constraint cpa_handle_fmt check (handle ~ '^[A-Za-z0-9_.-]{3,20}$' and handle_key = lower(handle)),
  constraint cpa_avatar_fmt check (avatar_url = '' or avatar_url ~ '^https://cards\.scryfall\.io/[A-Za-z0-9/._-]+(\?[A-Za-z0-9=&._-]*)?$'),
  constraint cpa_avatar_name_len check (char_length(avatar_name) <= 160)
);

alter table public.cpa_profiles enable row level security;       -- senza policy: nessun accesso diretto
revoke all on public.cpa_profiles from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.cpa_profiles from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.cpa_profiles from authenticated; end if;
end $$;

-- ID che non si possono prendere
create or replace function public.cpa_reserved(k text) returns boolean
language sql immutable as $$ select k in ('admin', 'administrator', 'root', 'system', 'codighel', 'pisciatore', 'botto', 'coglio', 'moderator', 'support') $$;

create or replace function public.cpa_hash(s text) returns text
language sql immutable as $$ select encode(sha256(convert_to('cpa1:' || s, 'UTF8')), 'hex') $$;

-- Controlli comuni: i messaggi di errore (bad_handle, bad_secret, bad_avatar, bad_login, handle_taken) li legge l'app.
create or replace function public.cpa_check(p_handle text, p_secret text default null, p_url text default null) returns void
language plpgsql immutable as $$
begin
  if p_handle is null or p_handle !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'bad_handle'; end if;
  if p_secret is not null and p_secret !~ '^[A-Za-z0-9]{16,64}$' then raise exception 'bad_secret'; end if;
  if p_url is not null and p_url <> '' and p_url !~ '^https://cards\.scryfall\.io/[A-Za-z0-9/._-]+(\?[A-Za-z0-9=&._-]*)?$' then raise exception 'bad_avatar'; end if;
end $$;

-- Chi sei: restituisce il profilo se ID e codice combaciano, altrimenti «bad_login».
create or replace function public.cpa_auth(p_handle text, p_secret text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if p_handle is null or p_secret is null or p_handle !~ '^[A-Za-z0-9_.-]{3,20}$' or p_secret !~ '^[A-Za-z0-9]{16,64}$' then raise exception 'bad_login'; end if;
  select id into v from cpa_profiles where handle_key = lower(p_handle) and secret_hash = cpa_hash(p_secret);
  if v is null then raise exception 'bad_login'; end if;
  return v;
end $$;

-- L'ID è libero?
create or replace function public.cpa_handle_free(p_handle text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform cpa_check(p_handle);
  return not cpa_reserved(lower(p_handle)) and not exists (select 1 from cpa_profiles where handle_key = lower(p_handle));
end $$;

-- Il profilo pubblico di un ID (serve a trovarsi tra amici): solo ID e immagine, mai il codice.
create or replace function public.cpa_profile(p_handle text) returns json
language plpgsql security definer set search_path = public as $$
declare r cpa_profiles;
begin
  perform cpa_check(p_handle);
  select * into r from cpa_profiles where handle_key = lower(p_handle);
  if not found then return null; end if;
  return json_build_object('handle', r.handle, 'avatar_name', r.avatar_name, 'avatar_url', r.avatar_url);
end $$;

create or replace function public.cpa_register(p_handle text, p_secret text, p_name text default '', p_url text default '') returns json
language plpgsql security definer set search_path = public as $$
begin
  perform cpa_check(p_handle, p_secret, p_url);
  if cpa_reserved(lower(p_handle)) then raise exception 'handle_taken'; end if;
  insert into cpa_profiles (handle, handle_key, secret_hash, avatar_name, avatar_url)
  values (p_handle, lower(p_handle), cpa_hash(p_secret), left(coalesce(p_name, ''), 160), coalesce(p_url, ''));
  return json_build_object('id', (select id from cpa_profiles where handle_key = lower(p_handle)), 'handle', p_handle, 'avatar_name', left(coalesce(p_name, ''), 160), 'avatar_url', coalesce(p_url, ''));
exception when unique_violation then raise exception 'handle_taken';
end $$;

create or replace function public.cpa_login(p_handle text, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare v uuid; r cpa_profiles;
begin
  v := cpa_auth(p_handle, p_secret);
  update cpa_profiles set seen_at = now() where id = v returning * into r;
  return json_build_object('id', r.id, 'handle', r.handle, 'avatar_name', r.avatar_name, 'avatar_url', r.avatar_url);
end $$;

create or replace function public.cpa_set_avatar(p_handle text, p_secret text, p_name text, p_url text) returns json
language plpgsql security definer set search_path = public as $$
declare v uuid; r cpa_profiles;
begin
  perform cpa_check(p_handle, p_secret, p_url);
  v := cpa_auth(p_handle, p_secret);
  update cpa_profiles set avatar_name = left(coalesce(p_name, ''), 160), avatar_url = coalesce(p_url, ''), seen_at = now() where id = v returning * into r;
  return json_build_object('handle', r.handle, 'avatar_name', r.avatar_name, 'avatar_url', r.avatar_url);
end $$;

create or replace function public.cpa_rename(p_handle text, p_secret text, p_new text) returns json
language plpgsql security definer set search_path = public as $$
declare v uuid; r cpa_profiles;
begin
  perform cpa_check(p_new);
  v := cpa_auth(p_handle, p_secret);
  if cpa_reserved(lower(p_new)) then raise exception 'handle_taken'; end if;
  update cpa_profiles set handle = p_new, handle_key = lower(p_new), seen_at = now() where id = v returning * into r;
  return json_build_object('handle', r.handle, 'avatar_name', r.avatar_name, 'avatar_url', r.avatar_url);
exception when unique_violation then raise exception 'handle_taken';
end $$;

create or replace function public.cpa_delete(p_handle text, p_secret text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  v := cpa_auth(p_handle, p_secret);
  delete from cpa_profiles where id = v;
  return true;
end $$;

-- ============ Amici (tappa 2) ============
-- Una riga per ogni coppia: chi ha chiesto (a), chi ha ricevuto (b) e se l'amicizia e' stata accettata.
-- Le richieste hanno bisogno del sì dell'altro; se due persone si chiedono a vicenda l'amicizia scatta subito.
create table if not exists public.cpa_friends (
  a          uuid not null references public.cpa_profiles(id) on delete cascade,
  b          uuid not null references public.cpa_profiles(id) on delete cascade,
  status     text not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (a, b),
  constraint cpa_friends_not_self check (a <> b),
  constraint cpa_friends_status check (status in ('pending', 'accepted'))
);
create unique index if not exists cpa_friends_pair on public.cpa_friends (least(a, b), greatest(a, b));   -- una sola relazione per coppia
create index if not exists cpa_friends_b on public.cpa_friends (b);
alter table public.cpa_friends enable row level security;       -- senza policy: nessun accesso diretto
revoke all on public.cpa_friends from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.cpa_friends from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.cpa_friends from authenticated; end if;
end $$;

-- Chiede l'amicizia (restituisce 'pending', oppure 'accepted' se eravate già amici o l'altro l'aveva già chiesta a te).
-- Errori: no_such_user, self, too_many (al massimo 30 richieste in attesa e 100 amici).
create or replace function public.cpa_friend_request(p_handle text, p_secret text, p_to text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid; t uuid; r cpa_friends; cnt int;
begin
  me := cpa_auth(p_handle, p_secret);
  perform cpa_check(p_to);
  select id into t from cpa_profiles where handle_key = lower(p_to);
  if t is null then raise exception 'no_such_user'; end if;
  if t = me then raise exception 'self'; end if;
  select * into r from cpa_friends where (a = me and b = t) or (a = t and b = me);
  if found then
    if r.status = 'accepted' then return 'accepted'; end if;
    if r.a = me then return 'pending'; end if;
    update cpa_friends set status = 'accepted' where a = r.a and b = r.b;
    return 'accepted';
  end if;
  select count(*) into cnt from cpa_friends where a = me and status = 'pending';
  if cnt >= 30 then raise exception 'too_many'; end if;
  select count(*) into cnt from cpa_friends where (a = me or b = me) and status = 'accepted';
  if cnt >= 100 then raise exception 'too_many'; end if;
  insert into cpa_friends (a, b) values (me, t);
  return 'pending';
exception when unique_violation then return 'pending';
end $$;

-- Risponde a una richiesta ricevuta: accetta (true) o rifiuta (false). Errore: no_request.
create or replace function public.cpa_friend_respond(p_handle text, p_secret text, p_from text, p_accept boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; f uuid; cnt int;
begin
  me := cpa_auth(p_handle, p_secret);
  perform cpa_check(p_from);
  select id into f from cpa_profiles where handle_key = lower(p_from);
  if f is null or not exists (select 1 from cpa_friends where a = f and b = me and status = 'pending') then raise exception 'no_request'; end if;
  if coalesce(p_accept, false) then
    select count(*) into cnt from cpa_friends where (a = me or b = me) and status = 'accepted';
    if cnt >= 100 then raise exception 'too_many'; end if;
    update cpa_friends set status = 'accepted' where a = f and b = me;
    return true;
  end if;
  delete from cpa_friends where a = f and b = me;
  return false;
end $$;

-- Toglie un amico o annulla una richiesta (in entrambi i versi). Restituisce se c'era qualcosa da togliere.
create or replace function public.cpa_friend_remove(p_handle text, p_secret text, p_other text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; o uuid; n int;
begin
  me := cpa_auth(p_handle, p_secret);
  perform cpa_check(p_other);
  select id into o from cpa_profiles where handle_key = lower(p_other);
  if o is null then return false; end if;
  delete from cpa_friends where (a = me and b = o) or (a = o and b = me);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Amici, richieste ricevute e richieste inviate (solo ID e immagine di ognuno).
create or replace function public.cpa_friend_list(p_handle text, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  return json_build_object(
    'friends', coalesce((select json_agg(json_build_object('id', p.id, 'handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = case when f.a = me then f.b else f.a end where (f.a = me or f.b = me) and f.status = 'accepted'), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('id', p.id, 'handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = f.a where f.b = me and f.status = 'pending'), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('id', p.id, 'handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = f.b where f.a = me and f.status = 'pending'), '[]'::json));
end $$;

-- ============ Tavoli condivisi (tappa 4) ============
-- Un tavolo ha un proprietario, dei posti (nomi liberi oppure amici con un Codighel ID) e le sue partite.
-- Lo vedono e ci registrano le partite il proprietario e gli amici seduti al tavolo; lo cambia o lo elimina solo il proprietario.
create table if not exists public.cpa_tables (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references public.cpa_profiles(id) on delete cascade,
  name       text not null,
  data       jsonb not null,                 -- {players: [{name, u}], start, cmd_life}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpa_tables_name check (char_length(name) between 1 and 30)
);
create table if not exists public.cpa_table_members (
  table_id   uuid not null references public.cpa_tables(id) on delete cascade,
  profile_id uuid not null references public.cpa_profiles(id) on delete cascade,
  primary key (table_id, profile_id)
);
create index if not exists cpa_table_members_p on public.cpa_table_members (profile_id);
create table if not exists public.cpa_games (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid not null references public.cpa_tables(id) on delete cascade,
  author     uuid references public.cpa_profiles(id) on delete set null,
  t          bigint not null default 0,
  rec        jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists cpa_games_table on public.cpa_games (table_id, t desc);
alter table public.cpa_tables enable row level security;
alter table public.cpa_table_members enable row level security;
alter table public.cpa_games enable row level security;
revoke all on public.cpa_tables, public.cpa_table_members, public.cpa_games from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.cpa_tables, public.cpa_table_members, public.cpa_games from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.cpa_tables, public.cpa_table_members, public.cpa_games from authenticated; end if;
end $$;

create or replace function public.cpa_uuid_or_null(s text) returns uuid
language plpgsql immutable as $$
begin return s::uuid; exception when others then return null; end $$;

create or replace function public.cpa_is_member(p_table uuid, me uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from cpa_table_members where table_id = p_table and profile_id = me) $$;

-- Il tavolo come lo vede l'app: i posti con l'ID attuale degli amici.
create or replace function public.cpa_table_doc(p_id uuid, me uuid) returns json
language plpgsql security definer set search_path = public as $$
declare t cpa_tables;
begin
  select * into t from cpa_tables where id = p_id;
  if not found then return null; end if;
  return json_build_object('id', t.id, 'name', t.name, 'owner', (select handle from cpa_profiles where id = t.owner), 'mine', t.owner = me,
    'start', (t.data->>'start')::int, 'cmd_life', coalesce((t.data->>'cmd_life')::boolean, true),
    'players', coalesce((select json_agg(case when pr.id is not null then json_build_object('name', pr.handle, 'u', pr.id, 'avatar_url', pr.avatar_url)
        else json_build_object('name', e.p->>'name', 'u', null, 'avatar_url', '') end order by e.ord)
      from jsonb_array_elements(t.data->'players') with ordinality as e(p, ord) left join cpa_profiles pr on pr.id::text = e.p->>'u'), '[]'::json));
end $$;

-- Controlla i posti: 2-6, nomi liberi o amici del proprietario (o gia' al tavolo). Errori: bad_data, not_friend.
create or replace function public.cpa_roster(p_players json, p_owner uuid, p_keep uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o jsonb := '[]'::jsonb; e json; u uuid; nm text; seen uuid[] := '{}';
begin
  if p_players is null or json_typeof(p_players) <> 'array' or json_array_length(p_players) < 2 or json_array_length(p_players) > 6 then raise exception 'bad_data'; end if;
  for e in select value from json_array_elements(p_players) loop
    nm := left(btrim(coalesce(e->>'name', '')), 24); u := null;
    if coalesce(e->>'u', '') <> '' then
      u := cpa_uuid_or_null(e->>'u'); nm := null;
      if u is not null then select handle into nm from cpa_profiles where id = u; end if;
      if nm is null or u = any(seen) then raise exception 'bad_data'; end if;
      if not (u = p_owner or u = any(p_keep) or exists (select 1 from cpa_friends f where f.status = 'accepted' and ((f.a = p_owner and f.b = u) or (f.a = u and f.b = p_owner)))) then raise exception 'not_friend'; end if;
      seen := seen || u;
    elsif nm = '' then raise exception 'bad_data';
    end if;
    o := o || jsonb_build_array(jsonb_build_object('name', nm, 'u', u));
  end loop;
  return o;
end $$;

-- Crea (p_id nullo) o aggiorna un tavolo; solo il proprietario lo aggiorna. Restituisce il tavolo.
-- Errori: bad_data, not_friend, no_table, not_owner, too_many (al massimo 20 tavoli propri).
create or replace function public.cpa_table_save(p_handle text, p_secret text, p_id uuid, p_name text, p_players json, p_start int, p_cmd_life boolean) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid; t cpa_tables; tid uuid; nm text; roster jsonb; keep uuid[]; cnt int;
begin
  me := cpa_auth(p_handle, p_secret);
  nm := left(btrim(coalesce(p_name, '')), 30);
  if nm = '' or p_start is null or p_start < 1 or p_start > 999 then raise exception 'bad_data'; end if;
  if p_id is null then
    select count(*) into cnt from cpa_tables where owner = me; if cnt >= 20 then raise exception 'too_many'; end if;
    roster := cpa_roster(p_players, me, '{}');
    insert into cpa_tables (owner, name, data) values (me, nm, jsonb_build_object('players', roster, 'start', p_start, 'cmd_life', coalesce(p_cmd_life, true))) returning id into tid;
  else
    select * into t from cpa_tables where id = p_id;
    if not found or not cpa_is_member(p_id, me) then raise exception 'no_table'; end if;
    if t.owner <> me then raise exception 'not_owner'; end if;
    select coalesce(array_agg(profile_id), '{}') into keep from cpa_table_members where table_id = p_id;
    roster := cpa_roster(p_players, me, keep); tid := p_id;
    update cpa_tables set name = nm, data = jsonb_build_object('players', roster, 'start', p_start, 'cmd_life', coalesce(p_cmd_life, true)), updated_at = now() where id = tid;
  end if;
  delete from cpa_table_members where table_id = tid;
  insert into cpa_table_members (table_id, profile_id) select tid, me union select tid, (e->>'u')::uuid from jsonb_array_elements(roster) e where e->>'u' is not null;
  return cpa_table_doc(tid, me);
end $$;

-- I tavoli di cui faccio parte.
create or replace function public.cpa_table_list(p_handle text, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  return coalesce((select json_agg(cpa_table_doc(t.id, me) order by t.created_at, t.id) from cpa_tables t join cpa_table_members m on m.table_id = t.id where m.profile_id = me), '[]'::json);
end $$;

-- Le ultime 200 partite di un tavolo.
create or replace function public.cpa_table_games(p_handle text, p_secret text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  if p_id is null or not cpa_is_member(p_id, me) then raise exception 'no_table'; end if;
  return coalesce((select jsonb_agg(g.rec || jsonb_build_object('gid', g.id) order by g.t desc, g.created_at desc)::json
    from (select * from cpa_games where table_id = p_id order by t desc, created_at desc limit 200) g), '[]'::json);
end $$;

-- Registra una partita (ripulita qui: al massimo 6 giocatori, testi corti, ID solo di chi e' al tavolo). Tiene le ultime 500.
create or replace function public.cpa_game_add(p_handle text, p_secret text, p_table uuid, p_rec json) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid; r jsonb; mem uuid[]; clean jsonb; gid uuid; wu uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  if p_table is null or not cpa_is_member(p_table, me) then raise exception 'no_table'; end if;
  select array_agg(profile_id) into mem from cpa_table_members where table_id = p_table;
  begin
    r := p_rec::jsonb;
    if jsonb_typeof(r) <> 'object' or length(r::text) > 8000 or jsonb_typeof(r->'players') <> 'array' or jsonb_array_length(r->'players') not between 2 and 6 then raise exception 'bad_data'; end if;
    wu := cpa_uuid_or_null(r->>'wu'); if wu is not null and not (wu = any(mem)) then wu := null; end if;
    clean := jsonb_build_object(
      't', greatest(0, coalesce((r->>'t')::bigint, 0)), 'ms', greatest(0, coalesce((r->>'ms')::bigint, 0)),
      'rounds', greatest(1, least(9999, coalesce((r->>'rounds')::int, 1))), 'start', greatest(1, least(999, coalesce((r->>'start')::int, 40))),
      'players', (select jsonb_agg(jsonb_build_object('name', coalesce(nullif(left(btrim(coalesce(p->>'name', '')), 24), ''), '?'),
          'u', (select x from (select cpa_uuid_or_null(p->>'u') as x) q where x = any(mem)),
          'life', greatest(-999, least(9999, coalesce((p->>'life')::int, 0))), 'out', coalesce((p->>'out')::boolean, false))) from jsonb_array_elements(r->'players') p),
      'winner', left(btrim(coalesce(r->>'winner', '')), 24), 'wu', wu, 'deck', left(btrim(coalesce(r->>'deck', '')), 60));
  exception when others then raise exception 'bad_data';
  end;
  insert into cpa_games (table_id, author, t, rec) values (p_table, me, (clean->>'t')::bigint, clean) returning id into gid;
  delete from cpa_games where table_id = p_table and id not in (select id from cpa_games where table_id = p_table order by t desc, created_at desc limit 500);
  return json_build_object('gid', gid);
end $$;

create or replace function public.cpa_game_delete(p_handle text, p_secret text, p_table uuid, p_game uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; n int;
begin
  me := cpa_auth(p_handle, p_secret);
  if p_table is null or not cpa_is_member(p_table, me) then raise exception 'no_table'; end if;
  delete from cpa_games where id = p_game and table_id = p_table;
  get diagnostics n = row_count; return n > 0;
end $$;

-- Elimina il tavolo con le sue partite (solo il proprietario).
create or replace function public.cpa_table_delete(p_handle text, p_secret text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; t cpa_tables;
begin
  me := cpa_auth(p_handle, p_secret);
  select * into t from cpa_tables where id = p_id;
  if not found or not cpa_is_member(p_id, me) then raise exception 'no_table'; end if;
  if t.owner <> me then raise exception 'not_owner'; end if;
  delete from cpa_tables where id = p_id; return true;
end $$;

-- Lascia un tavolo che non e' tuo: il tuo posto resta come nome libero. Errore: is_owner.
create or replace function public.cpa_table_leave(p_handle text, p_secret text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; t cpa_tables;
begin
  me := cpa_auth(p_handle, p_secret);
  select * into t from cpa_tables where id = p_id;
  if not found or not cpa_is_member(p_id, me) then raise exception 'no_table'; end if;
  if t.owner = me then raise exception 'is_owner'; end if;
  update cpa_tables set data = jsonb_set(data, '{players}', (select jsonb_agg(case when e.p->>'u' = me::text then jsonb_build_object('name', (select handle from cpa_profiles where id = me), 'u', null) else e.p end order by e.ord)
    from jsonb_array_elements(data->'players') with ordinality as e(p, ord))), updated_at = now() where id = p_id;
  delete from cpa_table_members where table_id = p_id and profile_id = me;
  return true;
end $$;

-- ============ Chat? Ma questa cosa è reale? (annunci dei mazzi) ============
-- Quando cambi lo stato di un tuo mazzo (da stampare, stampato ma non pronto, attivo, smontato) l'app può annunciarlo agli amici:
-- una riga qui, con il nome del commander e il suo artwork (solo da Scryfall). La vedono tu e i tuoi amici; si tengono gli ultimi 60 giorni.
create table if not exists public.cpa_feed (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null references public.cpa_profiles(id) on delete cascade,
  deck_key   text not null default '',
  deck_name  text not null default '',
  commander  text not null default '',
  image_url  text not null default '',
  from_st    text not null,
  to_st      text not null,
  created_at timestamptz not null default now(),
  constraint cpa_feed_st check (from_st in ('active', 'unprinted', 'printed', 'inactive') and to_st in ('active', 'unprinted', 'printed', 'inactive') and from_st <> to_st),
  constraint cpa_feed_img check (image_url = '' or image_url ~ '^https://cards\.scryfall\.io/[A-Za-z0-9/._-]+(\?[A-Za-z0-9=&._-]*)?$')
);
create index if not exists cpa_feed_author on public.cpa_feed (author, created_at desc);
alter table public.cpa_feed enable row level security;
revoke all on public.cpa_feed from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.cpa_feed from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.cpa_feed from authenticated; end if;
end $$;

-- Annuncia il cambio di stato di un mazzo. Cambi ravvicinati dello stesso mazzo (10 minuti) si fondono in uno solo, e se si torna
-- allo stato di partenza non resta niente: niente raffiche di messaggi per un tocco sbagliato.
create or replace function public.cpa_feed_post(p_handle text, p_secret text, p_deck text, p_name text, p_cmd text, p_img text, p_from text, p_to text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid; prev cpa_feed; k text; f text; nid uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  if p_from not in ('active', 'unprinted', 'printed', 'inactive') or p_to not in ('active', 'unprinted', 'printed', 'inactive') or p_from = p_to then raise exception 'bad_data'; end if;
  if (select count(*) from cpa_feed where author = me and created_at > now() - interval '1 hour') >= 40 then raise exception 'too_many'; end if;
  k := left(btrim(coalesce(p_deck, '')), 40); f := p_from;
  if k <> '' then
    select * into prev from cpa_feed where author = me and deck_key = k and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
    if found then
      f := prev.from_st;
      delete from cpa_feed where author = me and deck_key = k and created_at > now() - interval '10 minutes';
      if f = p_to then return null; end if;
    end if;
  end if;
  insert into cpa_feed (author, deck_key, deck_name, commander, image_url, from_st, to_st)
  values (me, k, left(btrim(coalesce(p_name, '')), 60), left(btrim(coalesce(p_cmd, '')), 80),
    case when coalesce(p_img, '') ~ '^https://cards\.scryfall\.io/[A-Za-z0-9/._-]+(\?[A-Za-z0-9=&._-]*)?$' then p_img else '' end, f, p_to)
  returning id into nid;
  delete from cpa_feed where author = me and id not in (select id from cpa_feed where author = me order by created_at desc limit 100);
  return json_build_object('id', nid);
end $$;

-- Gli annunci di tutti gli amici accettati e i tuoi, dal più recente.
create or replace function public.cpa_feed_list(p_handle text, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := cpa_auth(p_handle, p_secret);
  return coalesce((select json_agg(x order by (x->>'t')::bigint desc) from (
    select json_build_object('id', e.id, 'mine', e.author = me, 'author', json_build_object('id', p.id, 'handle', p.handle, 'avatar_url', p.avatar_url),
      'deck', e.deck_name, 'commander', e.commander, 'image', e.image_url, 'from', e.from_st, 'to', e.to_st, 't', (extract(epoch from e.created_at) * 1000)::bigint) as x
    from cpa_feed e join cpa_profiles p on p.id = e.author
    where e.created_at > now() - interval '60 days'
      and (e.author = me or exists (select 1 from cpa_friends f where f.status = 'accepted' and ((f.a = me and f.b = e.author) or (f.b = me and f.a = e.author))))
    order by e.created_at desc limit 60) q), '[]'::json);
end $$;

-- Ritira un tuo annuncio.
create or replace function public.cpa_feed_delete(p_handle text, p_secret text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid; n int;
begin
  me := cpa_auth(p_handle, p_secret);
  delete from cpa_feed where id = p_id and author = me; get diagnostics n = row_count;
  return n > 0;
end $$;

-- Chi può chiamare cosa: l'app usa la chiave «anon», e basta; i controlli interni non si chiamano da fuori.
revoke all on function public.cpa_reserved(text), public.cpa_hash(text), public.cpa_check(text, text, text), public.cpa_auth(text, text) from public;
revoke all on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
  public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
  public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text),
  public.cpa_table_save(text, text, uuid, text, json, int, boolean), public.cpa_table_list(text, text), public.cpa_table_games(text, text, uuid), public.cpa_game_add(text, text, uuid, json),
  public.cpa_game_delete(text, text, uuid, uuid), public.cpa_table_delete(text, text, uuid), public.cpa_table_leave(text, text, uuid),
  public.cpa_feed_post(text, text, text, text, text, text, text, text), public.cpa_feed_list(text, text), public.cpa_feed_delete(text, text, uuid) from public;
revoke all on function public.cpa_uuid_or_null(text), public.cpa_is_member(uuid, uuid), public.cpa_table_doc(uuid, uuid), public.cpa_roster(json, uuid, uuid[]) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
      public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
      public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text),
      public.cpa_table_save(text, text, uuid, text, json, int, boolean), public.cpa_table_list(text, text), public.cpa_table_games(text, text, uuid), public.cpa_game_add(text, text, uuid, json),
      public.cpa_game_delete(text, text, uuid, uuid), public.cpa_table_delete(text, text, uuid), public.cpa_table_leave(text, text, uuid),
      public.cpa_feed_post(text, text, text, text, text, text, text, text), public.cpa_feed_list(text, text), public.cpa_feed_delete(text, text, uuid) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
      public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
      public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text),
      public.cpa_table_save(text, text, uuid, text, json, int, boolean), public.cpa_table_list(text, text), public.cpa_table_games(text, text, uuid), public.cpa_game_add(text, text, uuid, json),
      public.cpa_game_delete(text, text, uuid, uuid), public.cpa_table_delete(text, text, uuid), public.cpa_table_leave(text, text, uuid),
      public.cpa_feed_post(text, text, text, text, text, text, text, text), public.cpa_feed_list(text, text), public.cpa_feed_delete(text, text, uuid) to authenticated;
  end if;
end $$;

-- Dice a Supabase di rileggere le funzioni appena create.
notify pgrst, 'reload schema';
