-- Proof is asked for, never mandatory (owner's decision, 2026-10-22: "Evidence not mandated"). A task that asks for
-- proof can still be finished or sent in without it: Muntej's check (verify-proof) then tells the reviewer what's
-- missing, and the task page keeps showing "Needs proof" as a reminder. The finishing gate is removed.
drop trigger if exists require_proof on public.tasks;
drop function if exists public.require_proof();
