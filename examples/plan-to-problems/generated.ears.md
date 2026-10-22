# Fall desk

event borrow_requested: Bool "A member asks to take a copy home." phrase "a member asks to take a copy home"
event renew_requested: Bool "A member asks to renew a copy they already have." phrase "a member asks to renew a copy"
event copy_returned: Bool "A member brings a copy back." phrase "a member brings a copy back"
state copy_in_building: Bool "That copy is still in the building." phrase "the copy is in the building"
state copy_on_loan: Bool "That copy is already out on loan." phrase "the copy is out on loan"
state fine_owed: Bool "A member still owes a fine." phrase "a fine is owed"
state loan_overdue: Bool "The loan has passed its due date." phrase "the loan is overdue"
input loan_days: Int 1..21 "How many days the desk will set. Loans are only 1 to 21 days, and those are the only lengths the desk will set." phrase "the loan length"
output loan_allowed: Bool "Whether the loan was allowed." phrase "allow the loan" outcome "the loan was allowed" / "the loan was not allowed"
output renewal_allowed: Bool "Whether the renewal was allowed." phrase "allow the renewal" outcome "the renewal was allowed" / "the renewal was not allowed"
output reminder_sent: Bool "Whether a reminder went out." phrase "send a reminder" outcome "a reminder was sent" / "a reminder was not sent"
output loan_closed: Bool "Whether the loan was closed." phrase "close the loan" outcome "the loan was closed" / "the loan was not closed"

R1 While the copy is in the building, when a member asks to take a copy home, the Fall Desk shall allow the loan.
R2 While the copy is out on loan, when a member asks to take a copy home, the Fall Desk shall not allow the loan.
R3 While the copy is out on loan, when a member asks to take a copy home, the Fall Desk shall allow the loan.
R4 When not a member asks to take a copy home, the Fall Desk shall not allow the loan.
R5 While a fine is owed, when a member asks to renew a copy, the Fall Desk shall not allow the renewal.
R6 While a fine is owed, when a member asks to renew a copy, the Fall Desk shall allow the renewal.
R7 While a fine is not owed, when a member asks to renew a copy, the Fall Desk shall allow the renewal.
R8 While the loan is overdue, the Fall Desk shall send a reminder.
R9 When a member asks to take a copy home and the loan length is at least 40, the Fall Desk shall allow the loan.
R10 When a member brings a copy back, the Fall Desk shall close the loan.
R11 When a member brings a copy back and the loan is overdue, the Fall Desk shall close the loan.
R12 When not a member brings a copy back, the Fall Desk shall not close the loan.
