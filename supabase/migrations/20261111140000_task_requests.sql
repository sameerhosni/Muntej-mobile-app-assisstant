-- The owner, 11 Nov (option A): Nouran asked her manager in a chat to fix bugs; Muntej made it his task, the assign rule
-- refused it, and it sat on her list with a raw two-language error. "No one can send tasks to someone above them or in
-- another team not at the same level": an ask you can't give goes to YOUR manager as a request; they decide.
--   task_request          a new decision type: «نوران تطلب: …» in the manager's «يحتاجك», [أضفها / تجاهل]
--   answer_task_request   the manager's answer: add it (theirs, or someone they may give it to) or not; the found task
--                         on her list follows («سمير أضافها ✓» / «سمير ما أخذها»), she's told once, and again when done
--   withdraw_task_request she takes it back while it waits
alter type public.decision_type add value if not exists 'task_request';
