-- Org structure, part 1: new enum values (must be committed before they can be used in part 2).
alter type public.user_role add value if not exists 'admin';
alter type public.user_role add value if not exists 'super_admin';

create type public.person_status as enum ('active', 'pending', 'deleted');
