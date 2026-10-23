# Generated benchmark spec: 10 requirements, 2 desks, order amount 0..10.

input order_amount: Int 0..10 "How much the customer asks for." phrase "the order amount"
event amber_requested: Bool "A customer asks the amber desk for service." phrase "a amber request is made"
state amber_open: Bool "The amber desk is staffed." phrase "the amber desk is open"
output amber_approved: Bool "The amber request is approved." phrase "approve the amber request" outcome "the amber request was approved" / "the amber request was not approved"
output amber_points: Int 0..9 "How many amber points are granted." phrase "the amber points" as "grant {op} {value} amber points" says "{value} amber points were granted"
event birch_requested: Bool "A customer asks the birch desk for service." phrase "a birch request is made"
state birch_open: Bool "The birch desk is staffed." phrase "the birch desk is open"
output birch_approved: Bool "The birch request is approved." phrase "approve the birch request" outcome "the birch request was approved" / "the birch request was not approved"
output birch_points: Int 0..9 "How many birch points are granted." phrase "the birch points" as "grant {op} {value} birch points" says "{value} birch points were granted"

R1 While the amber desk is open, when a amber request is made, the Amber Desk shall approve the amber request.
R2 While the amber desk is not open, when a amber request is made, the Amber Desk shall not approve the amber request.
R3 When a amber request is made and the order amount is at least 6, the Amber Desk shall grant at most 5 amber points.
R4 When a amber request is made and the order amount is greater than 8, the Amber Desk shall grant 7 amber points.
R5 When a amber request is not made, the Amber Desk shall grant 0 amber points.
R6 While the birch desk is open, when a birch request is made, the Birch Desk shall approve the birch request.
R7 While the birch desk is not open, when a birch request is made, the Birch Desk shall not approve the birch request.
R8 When a birch request is made and the order amount is at least 6, the Birch Desk shall grant at most 5 birch points.
R9 When a birch request is made and the order amount is less than 2, the Birch Desk shall grant 2 birch points.
R10 When a birch request is not made, the Birch Desk shall grant 0 birch points.
