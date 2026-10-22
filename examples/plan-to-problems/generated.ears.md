# Hand-written placeholder. Phase 2 replaces this file with model output.
# Faithful translation of plan.md. Not produced by a model.

event copy_requested: Bool "A member asks to borrow a copy." phrase "a copy is requested"
state copy_on_loan: Bool "That copy is already out with someone." phrase "the copy is on loan"
state fine_due: Bool "The member still owes a fine." phrase "a fine is due"
state loan_overdue: Bool "The loan is past its due date." phrase "the loan is overdue"
event copy_returned: Bool "A member brings a copy back." phrase "a copy is returned"
input loan_days: Int 1..21 "How many days the member wants to keep the copy." phrase "the loan length"
output loan_allowed: Bool "The member may take the copy home." phrase "allow the loan" outcome "the loan was allowed" / "the loan was not allowed"
output renewal_allowed: Bool "The member may extend the loan." phrase "allow the renewal" outcome "the renewal was allowed" / "the renewal was not allowed"
output reminder_sent: Bool "A due reminder goes to the member." phrase "send a reminder" outcome "a reminder was sent" / "a reminder was not sent"
output loan_cleared: Bool "The loan is closed." phrase "clear the loan" outcome "the loan was cleared" / "the loan was not cleared"

R1 When a copy is requested and the copy is on loan, the Library shall not allow the loan.
R2 When a copy is requested and the copy is on loan, the Library shall allow the loan.
R3 When a copy is requested and the copy is not on loan, the Library shall allow the loan.
R4 When a copy is not requested, the Library shall not allow the loan.
R5 When a fine is due, the Library shall not allow the renewal.
R6 When a fine is due, the Library shall allow the renewal.
R7 When a fine is not due, the Library shall allow the renewal.
R8 When the loan is overdue, the Library shall send a reminder.
R9 When the loan length is at least 40, the Library shall allow the loan.
R10 When a copy is returned, the Library shall clear the loan.
R11 When a copy is returned and the loan is overdue, the Library shall clear the loan.
R12 When a copy is not returned, the Library shall not clear the loan.
