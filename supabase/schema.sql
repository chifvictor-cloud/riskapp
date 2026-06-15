-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- USERS PROFILE TABLE
-- =====================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  fortnite_username text,
  balance decimal(10, 2) default 0.00 not null,
  total_earnings decimal(10, 2) default 0.00 not null,
  wins integer default 0 not null,
  losses integer default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint balance_non_negative check (balance >= 0)
);

-- =====================
-- TOURNAMENTS TABLE
-- =====================
create table public.tournaments (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  game_mode text default 'Duels' not null,
  entry_fee decimal(10, 2) not null,
  prize_pool decimal(10, 2) not null,
  max_players integer default 2 not null,
  current_players integer default 0 not null,
  status text default 'open' not null check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  rules text,
  created_by uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- =====================
-- TOURNAMENT PARTICIPANTS
-- =====================
create table public.tournament_participants (
  id uuid default uuid_generate_v4() primary key,
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'registered' not null check (status in ('registered', 'ready', 'playing', 'eliminated', 'winner')),
  joined_at timestamptz default now() not null,
  unique(tournament_id, player_id)
);

-- =====================
-- MATCHES TABLE
-- =====================
create table public.matches (
  id uuid default uuid_generate_v4() primary key,
  tournament_id uuid references public.tournaments(id) on delete cascade not null,
  player1_id uuid references public.profiles(id) on delete cascade not null,
  player2_id uuid references public.profiles(id) on delete cascade not null,
  winner_id uuid references public.profiles(id) on delete set null,
  player1_score integer default 0,
  player2_score integer default 0,
  status text default 'pending' not null check (status in ('pending', 'in_progress', 'completed', 'disputed')),
  played_at timestamptz,
  created_at timestamptz default now() not null
);

-- =====================
-- TRANSACTIONS TABLE
-- =====================
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('deposit', 'withdrawal', 'entry_fee', 'prize', 'refund')),
  amount decimal(10, 2) not null,
  status text default 'pending' not null check (status in ('pending', 'completed', 'failed', 'cancelled')),
  reference_id uuid,
  description text,
  created_at timestamptz default now() not null
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.matches enable row level security;
alter table public.transactions enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Tournaments policies
create policy "Tournaments are viewable by everyone"
  on public.tournaments for select using (true);

create policy "Authenticated users can create tournaments"
  on public.tournaments for insert with check (auth.role() = 'authenticated');

create policy "Tournament creators can update their tournaments"
  on public.tournaments for update using (auth.uid() = created_by);

-- Tournament participants policies
create policy "Participants are viewable by everyone"
  on public.tournament_participants for select using (true);

create policy "Authenticated users can join tournaments"
  on public.tournament_participants for insert with check (auth.uid() = player_id);

create policy "Players can update their own participation"
  on public.tournament_participants for update using (auth.uid() = player_id);

-- Matches policies
create policy "Matches are viewable by everyone"
  on public.matches for select using (true);

-- Transactions policies
create policy "Users can view their own transactions"
  on public.transactions for select using (auth.uid() = user_id);

-- =====================
-- FUNCTIONS & TRIGGERS
-- =====================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger set_tournaments_updated_at
  before update on public.tournaments
  for each row execute procedure public.handle_updated_at();
