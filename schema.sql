-- 1) Supabase Authentication > Users ekranında kendi hesabınızı oluşturun.
-- 2) Aşağıdaki YOUR_AUTH_USER_UUID ifadesini o hesabın UUID değeriyle değiştirin.
-- 3) SQL Editor içinde bu dosyayı çalıştırın.
-- NOT: Projeye başka kullanıcı kaydı açmayın; Auth > Providers > Email altında yeni kayıtları kapatın.
create or replace function public.is_archive_owner()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() = 'YOUR_AUTH_USER_UUID'::uuid $$;
revoke all on function public.is_archive_owner() from public;
grant execute on function public.is_archive_owner() to authenticated;

create table if not exists public.publications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 title text not null, authors text, journal text, year int, doi text, pmid text,
 pubmed_url text, journal_url text, citation_count int not null default 0 check(citation_count>=0),
 citation_source text, notes text, pdf_path text, created_at timestamptz default now()
);
create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id), full_name text, institution text,
 specialty text, orcid text, contact_email text, bio text
);
alter table public.publications enable row level security;
alter table public.profiles enable row level security;
create policy "owner publications" on public.publications for all to authenticated
 using (public.is_archive_owner() and user_id=auth.uid())
 with check (public.is_archive_owner() and user_id=auth.uid());
create policy "owner profile" on public.profiles for all to authenticated
 using (public.is_archive_owner() and user_id=auth.uid())
 with check (public.is_archive_owner() and user_id=auth.uid());
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('publication-pdfs','publication-pdfs',false,26214400,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['application/pdf'];
create policy "owner pdf read" on storage.objects for select to authenticated
 using (bucket_id='publication-pdfs' and public.is_archive_owner() and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owner pdf upload" on storage.objects for insert to authenticated
 with check (bucket_id='publication-pdfs' and public.is_archive_owner() and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owner pdf delete" on storage.objects for delete to authenticated
 using (bucket_id='publication-pdfs' and public.is_archive_owner() and (storage.foldername(name))[1]=auth.uid()::text);
