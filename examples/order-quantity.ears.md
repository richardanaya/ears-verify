# R4 caps the accepted quantity at 10. R5 accepts an order of 12.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output quantity: Int 0..12 "How many units the order accepts." phrase "the quantity" as "accept {op} {value} units" says "{value} units were accepted"

R3 When an order is not submitted, the Order System shall accept 0 units.
R4 When an order is submitted, the Order System shall accept at most 10 units.
R5 When an order is submitted, the Order System shall accept 12 units.
