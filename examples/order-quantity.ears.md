# R4 caps the accepted quantity at 10. R5 accepts an order of 12.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output quantity: Int 0..12 "How many units the order accepts." phrase "the quantity"

R3 When not an order is submitted, the Order System shall the quantity is 0.
R4 When an order is submitted, the Order System shall the quantity is at most 10.
R5 When an order is submitted, the Order System shall the quantity is 12.
