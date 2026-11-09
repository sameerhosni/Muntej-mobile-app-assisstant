-- N9 (owner, 9 Nov): "I thought I would ask over the chat for an approval from my manager so it would reach". A new
-- kind of decision: someone asks for an approval in their own words. (Its own file: a new enum value can't be used in
-- the same transaction that adds it.)
alter type public.decision_type add value if not exists 'approval_request';
