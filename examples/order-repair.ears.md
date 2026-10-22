# The copy cannot be lent and refused for the same request.

state copy_in_building: Bool "That copy is still in the building." phrase "the copy is in the building"
state copy_on_loan: Bool "That copy is already out on loan." phrase "the copy is out on loan"
event borrow_requested: Bool "A member asks to take a copy home." phrase "a member asks to take a copy home"
output loan_allowed: Bool "Whether the loan was allowed." phrase "allow the loan" outcome "the loan was allowed" / "the loan was not allowed"

R1 While the copy is in the building, when a member asks to take a copy home, the Desk shall allow the loan.
R2 While the copy is out on loan, when a member asks to take a copy home, the Desk shall not allow the loan.
