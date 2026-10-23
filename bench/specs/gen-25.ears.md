# Generated benchmark spec: 25 requirements, 5 desks, order amount 0..10.

input order_amount: Int 0..10 "How much the customer asks for." phrase "the order amount"
event amber_requested: Bool "A customer asks the amber desk for service." phrase "a amber request is made"
state amber_open: Bool "The amber desk is staffed." phrase "the amber desk is open"
output amber_approved: Bool "The amber request is approved." phrase "approve the amber request" outcome "the amber request was approved" / "the amber request was not approved"
output amber_points: Int 0..9 "How many amber points are granted." phrase "the amber points" as "grant {op} {value} amber points" says "{value} amber points were granted"
event birch_requested: Bool "A customer asks the birch desk for service." phrase "a birch request is made"
state birch_open: Bool "The birch desk is staffed." phrase "the birch desk is open"
output birch_approved: Bool "The birch request is approved." phrase "approve the birch request" outcome "the birch request was approved" / "the birch request was not approved"
output birch_points: Int 0..9 "How many birch points are granted." phrase "the birch points" as "grant {op} {value} birch points" says "{value} birch points were granted"
event cedar_requested: Bool "A customer asks the cedar desk for service." phrase "a cedar request is made"
state cedar_open: Bool "The cedar desk is staffed." phrase "the cedar desk is open"
output cedar_approved: Bool "The cedar request is approved." phrase "approve the cedar request" outcome "the cedar request was approved" / "the cedar request was not approved"
output cedar_points: Int 0..9 "How many cedar points are granted." phrase "the cedar points" as "grant {op} {value} cedar points" says "{value} cedar points were granted"
event dune_requested: Bool "A customer asks the dune desk for service." phrase "a dune request is made"
state dune_open: Bool "The dune desk is staffed." phrase "the dune desk is open"
output dune_approved: Bool "The dune request is approved." phrase "approve the dune request" outcome "the dune request was approved" / "the dune request was not approved"
output dune_points: Int 0..9 "How many dune points are granted." phrase "the dune points" as "grant {op} {value} dune points" says "{value} dune points were granted"
event ember_requested: Bool "A customer asks the ember desk for service." phrase "a ember request is made"
state ember_open: Bool "The ember desk is staffed." phrase "the ember desk is open"
output ember_approved: Bool "The ember request is approved." phrase "approve the ember request" outcome "the ember request was approved" / "the ember request was not approved"
output ember_points: Int 0..9 "How many ember points are granted." phrase "the ember points" as "grant {op} {value} ember points" says "{value} ember points were granted"

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
R11 While the cedar desk is open, when a cedar request is made, the Cedar Desk shall approve the cedar request.
R12 While the cedar desk is not open, when a cedar request is made, the Cedar Desk shall not approve the cedar request.
R13 When a cedar request is made and the order amount is at least 6, the Cedar Desk shall grant at most 5 cedar points.
R14 When a cedar request is made and the order amount is less than 2, the Cedar Desk shall grant 2 cedar points.
R15 When a cedar request is not made, the Cedar Desk shall grant 0 cedar points.
R16 While the dune desk is open, when a dune request is made, the Dune Desk shall approve the dune request.
R17 While the dune desk is not open, when a dune request is made, the Dune Desk shall not approve the dune request.
R18 When a dune request is made and the order amount is at least 6, the Dune Desk shall grant at most 5 dune points.
R19 While the dune desk is open, when a dune request is made and the order amount is less than 2, the Dune Desk shall not approve the dune request.
R20 When a dune request is not made, the Dune Desk shall grant 0 dune points.
R21 While the ember desk is open, when a ember request is made, the Ember Desk shall approve the ember request.
R22 While the ember desk is not open, when a ember request is made, the Ember Desk shall not approve the ember request.
R23 When a ember request is made and the order amount is at least 6, the Ember Desk shall grant at most 5 ember points.
R24 When a ember request is made and the order amount is less than 2, the Ember Desk shall grant 2 ember points.
R25 When a ember request is not made, the Ember Desk shall grant 0 ember points.
