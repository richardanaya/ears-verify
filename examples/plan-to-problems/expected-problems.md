# Planted problems

These are the logical problems written into `plan.md` on purpose. The recorded spec uses the ids below. Line numbers are the lines in `generated.ears.md`.

## Two direct contradictions

The plan says not to lend a copy that is already out, and then it says to lend that same copy. Those are R2 line 17 and R3 line 18. Both apply when a member asks to take a copy home while the copy is out on loan, and they demand opposite answers.

The plan says a member who still owes a fine cannot renew, and it also says that member can renew. Those are R5 line 20 and R6 line 21. Both apply when a fine is owed and a member asks to renew, and they demand opposite answers.

## One gap

The plan says to send a reminder after the due date. It never says what to do about a reminder when the loan is not overdue. No sentence covers that situation. The uncovered output is reminder_sent. R8 line 23 only speaks once the loan is overdue.

## One condition that can never be true

Loans are only 1 to 21 days, and the plan also says to allow a loan of 40 days or longer. A loan length of at least 40 days cannot happen. That is R9 line 24.

## One redundant requirement

Closing the loan when a copy comes back already requires the overdue case too. Saying it again adds nothing. R11 line 26 only repeats R10 line 25 in the stricter case where the loan is also overdue.

## Negated triggers

R4 line 19 says "When not a member asks to take a copy home". R12 line 27 says "When not a member brings a copy back". Lint flags each sentence as wording kind `negation`. The suggested rewrite is a positive condition, such as "When a non-member asks", or a positive event.
