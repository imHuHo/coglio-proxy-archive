-- Coglio Proxy Archive · Codighel ID (tappa 1) e amici (tappa 2)
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
  return json_build_object('handle', p_handle, 'avatar_name', left(coalesce(p_name, ''), 160), 'avatar_url', coalesce(p_url, ''));
exception when unique_violation then raise exception 'handle_taken';
end $$;

create or replace function public.cpa_login(p_handle text, p_secret text) returns json
language plpgsql security definer set search_path = public as $$
declare v uuid; r cpa_profiles;
begin
  v := cpa_auth(p_handle, p_secret);
  update cpa_profiles set seen_at = now() where id = v returning * into r;
  return json_build_object('handle', r.handle, 'avatar_name', r.avatar_name, 'avatar_url', r.avatar_url);
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
    'friends', coalesce((select json_agg(json_build_object('handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = case when f.a = me then f.b else f.a end where (f.a = me or f.b = me) and f.status = 'accepted'), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = f.a where f.b = me and f.status = 'pending'), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('handle', p.handle, 'avatar_name', p.avatar_name, 'avatar_url', p.avatar_url) order by p.handle_key)
      from cpa_friends f join cpa_profiles p on p.id = f.b where f.a = me and f.status = 'pending'), '[]'::json));
end $$;

-- Chi può chiamare cosa: l'app usa la chiave «anon», e basta; i controlli interni non si chiamano da fuori.
revoke all on function public.cpa_reserved(text), public.cpa_hash(text), public.cpa_check(text, text, text), public.cpa_auth(text, text) from public;
revoke all on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
  public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
  public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
      public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
      public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.cpa_handle_free(text), public.cpa_profile(text), public.cpa_register(text, text, text, text), public.cpa_login(text, text),
      public.cpa_set_avatar(text, text, text, text), public.cpa_rename(text, text, text), public.cpa_delete(text, text),
      public.cpa_friend_request(text, text, text), public.cpa_friend_respond(text, text, text, boolean), public.cpa_friend_remove(text, text, text), public.cpa_friend_list(text, text) to authenticated;
  end if;
end $$;

-- Dice a Supabase di rileggere le funzioni appena create.
notify pgrst, 'reload schema';
