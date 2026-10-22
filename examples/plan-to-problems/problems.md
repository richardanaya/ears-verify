# Logical problems

Spec: examples/plan-to-problems/generated.ears.md

These are the logical problems in the requirements. For a contradiction, which requirement should win? This report does not choose.

## 1. R1 and R2 cannot both hold.

They clash when a member asks to take a copy home, not a member asks to renew a copy, not a member brings a copy back, the copy was in the building, the copy was out on loan, a fine was not owed, the loan was not overdue, and the loan length was 1.

R1 line 16
"While the copy is in the building, when a member asks to take a copy home, the Fall Desk shall allow the loan."

R2 line 17
"While the copy is out on loan, when a member asks to take a copy home, the Fall Desk shall not allow the loan."

R1 requires that the loan was allowed.
R2 requires that the loan was not allowed.

Which requirement should win? To keep R1, remove R2. To keep R2, remove R1. This report does not choose.

## 2. R2 and R3 cannot both hold.

They clash when a member asks to take a copy home, not a member asks to renew a copy, not a member brings a copy back, the copy was not in the building, the copy was out on loan, a fine was not owed, the loan was not overdue, and the loan length was 1.

R2 line 17
"While the copy is out on loan, when a member asks to take a copy home, the Fall Desk shall not allow the loan."

R3 line 18
"While the copy is out on loan, when a member asks to take a copy home, the Fall Desk shall allow the loan."

R2 requires that the loan was not allowed.
R3 requires that the loan was allowed.

Which requirement should win? To keep R2, remove R3. To keep R3, remove R2. This report does not choose.

## 3. R5 and R6 cannot both hold.

They clash when not a member asks to take a copy home, a member asks to renew a copy, not a member brings a copy back, the copy was not in the building, the copy was not out on loan, a fine was owed, the loan was not overdue, and the loan length was 1.

R5 line 20
"While a fine is owed, when a member asks to renew a copy, the Fall Desk shall not allow the renewal."

R6 line 21
"While a fine is owed, when a member asks to renew a copy, the Fall Desk shall allow the renewal."

R5 requires that the renewal was not allowed.
R6 requires that the renewal was allowed.

Which requirement should win? To keep R5, remove R6. To keep R6, remove R5. This report does not choose.

## 4. Nothing covers allow the loan (loan_allowed)

Nothing says whether the loan was allowed when a member asks to take a copy home, a member asks to renew a copy, a member brings a copy back, the copy was not in the building, the copy was not out on loan, a fine was owed, the loan was overdue, and the loan length was 21. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.

## 5. Nothing covers allow the renewal (renewal_allowed)

Nothing says whether the renewal was allowed when a member asks to take a copy home, not a member asks to renew a copy, a member brings a copy back, the copy was in the building, the copy was out on loan, a fine was owed, the loan was overdue, and the loan length was 21. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.

## 6. Nothing covers send a reminder (reminder_sent)

Nothing says whether a reminder was sent when a member asks to take a copy home, a member asks to renew a copy, a member brings a copy back, the copy was in the building, the copy was out on loan, a fine was owed, the loan was not overdue, and the loan length was 21. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.

## 7. R9 can never trigger

R9 line 24
"When a member asks to take a copy home and the loan length is at least 40, the Fall Desk shall allow the loan."

R9 can never trigger. Its condition is impossible for every allowed value.
Suggested fix: rewrite the condition in R9 so a real situation can make it true, or remove the requirement. Do not invent a response.

## 8. R11 adds nothing

R11 line 26
"When a member brings a copy back and the loan is overdue, the Fall Desk shall close the loan."

R11 adds nothing. It only repeats R10 in a stricter situation. Whenever R10 holds, R11 holds too.

R10 line 25
"When a member brings a copy back, the Fall Desk shall close the loan."

Ask whether R11 was meant to say something R10 does not already require. Do not delete it until the product manager agrees.
