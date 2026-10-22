# The trigger is a bare negation. A positive event would name the person.

event borrow_requested: Bool "A member asks to take a copy home." phrase "a member asks to take a copy home"
output loan_allowed: Bool "Whether the loan was allowed." phrase "allow the loan" outcome "the loan was allowed" / "the loan was not allowed"

R1 When not a member asks to take a copy home, the Desk shall not allow the loan.
R2 When a member asks to take a copy home, the Desk shall allow the loan.
