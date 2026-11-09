-- «✓ خلصت أصلاً» on a decision card gets its own status (reviewer, 9 Nov: reusing 'approved' fired the "more time" /
-- "took it back" / "said yes" triggers for a different meaning). Its own file: a new enum value can't be used in the
-- transaction that adds it.
alter type public.decision_status add value if not exists 'finished';
