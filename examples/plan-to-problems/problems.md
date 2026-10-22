# Logical problems

Spec: examples/plan-to-problems/generated.ears.md

These are the logical problems in the requirements. For a contradiction, which requirement should win? This report does not choose.

## 1. R1 and R2 cannot both hold.

They clash when a copy was requested, the copy was on loan, a fine was not due, the loan was not overdue, a copy was not returned, and the loan length was 1.

R1 line 15
"When a copy is requested and the copy is on loan, the Library shall not allow the loan."

R2 line 16
"When a copy is requested and the copy is on loan, the Library shall allow the loan."

R1 requires that the loan was not allowed.
R2 requires that the loan was allowed.

Which requirement should win? To keep R1, remove R2. To keep R2, remove R1. This report does not choose.

## 2. R5 and R6 cannot both hold.

They clash when a copy was not requested, the copy was not on loan, a fine was due, the loan was not overdue, a copy was not returned, and the loan length was 1.

R5 line 19
"When a fine is due, the Library shall not allow the renewal."

R6 line 20
"When a fine is due, the Library shall allow the renewal."

R5 requires that the renewal was not allowed.
R6 requires that the renewal was allowed.

Which requirement should win? To keep R5, remove R6. To keep R6, remove R5. This report does not choose.

## 3. Nothing covers send a reminder (reminder_sent)

Nothing says whether a reminder was sent when a copy was requested, the copy was on loan, a fine was due, the loan was not overdue, a copy was returned, and the loan length was 21. Suggested fix: add a requirement for this situation, and ask what the system shall do. Do not choose the response.

## 4. R9 can never trigger

R9 line 23
"When the loan length is at least 40, the Library shall allow the loan."

R9 can never trigger. Its condition is impossible for every allowed value.
Suggested fix: rewrite the condition in R9 so a real situation can make it true, or remove the requirement. Do not invent a response.

## 5. R11 adds nothing

R11 line 25
"When a copy is returned and the loan is overdue, the Library shall clear the loan."

R11 adds nothing. It only repeats R10 in a stricter situation. Whenever R10 holds, R11 holds too.

R10 line 24
"When a copy is returned, the Library shall clear the loan."

Ask whether R11 was meant to say something R10 does not already require. Do not delete it until the product manager agrees.
