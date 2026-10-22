# Planted problems

These are the logical problems written into `plan.md` on purpose. The hand-written spec uses the ids below. Line numbers are the lines in `generated.ears.md`.

## Two direct contradictions

The plan says not to lend a copy that is already out, and then it says to lend that same copy. Those are R1 line 15 and R2 line 16. Both apply when a member asks for a copy that is already on loan, and they demand opposite answers.

The plan says a member who still owes a fine cannot renew, and it also says that member can renew. Those are R5 line 19 and R6 line 20. Both apply when a fine is due, and they demand opposite answers.

## One gap

The plan says to send a reminder after the due date. It never says what to do about a reminder when the loan is not overdue. No sentence covers that situation. The uncovered output is reminder_sent, from R8 line 22, which only speaks once the loan is overdue.

## One condition that can never be true

Loans are only 1 to 21 days, and the plan also says to allow a loan of 40 days or longer. A loan length of at least 40 days cannot happen. That is R9 line 23.

## One redundant requirement

Closing the loan when a copy comes back already requires the overdue case too. Saying it again adds nothing. R11 line 25 only repeats R10 line 24 in the stricter case where the loan is also overdue.
