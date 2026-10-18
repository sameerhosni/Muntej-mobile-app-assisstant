-- Sign-in moves from phone OTP to email OTP: profiles get an email and are linked by it on first sign-in.

alter table public.profiles add column email text;
create unique index profiles_email_key on public.profiles (lower(email));

-- seed people (no-op on a fresh database; seed.sql sets the same values)
update public.profiles set email = v.email
  from (values
    ('966500000001', 's.hosni@t2.sa'),
    ('966500000002', 's.hosni+faisal@t2.sa'),
    ('966500000003', 's.hosni+abdullah@t2.sa'),
    ('966500000004', 's.hosni+noura@t2.sa'),
    ('966500000005', 's.hosni+khalid@t2.sa'),
    ('966500000006', 's.hosni+saad@t2.sa'),
    ('966500000007', 's.hosni+maha@t2.sa')
  ) as v(phone, email)
 where profiles.phone = v.phone and profiles.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked uuid;
begin
  if new.email is not null then
    update public.profiles
       set user_id = new.id
     where lower(email) = lower(new.email) and user_id is null
    returning id into linked;
  end if;

  if linked is null and new.phone is not null then
    update public.profiles
       set user_id = new.id
     where phone = new.phone and user_id is null
    returning id into linked;
  end if;

  if linked is null then
    insert into public.profiles (user_id, email, phone, full_name)
    values (
      new.id,
      new.email,
      new.phone,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), new.phone, 'New user')
    );
  end if;
  return new;
end;
$$;
