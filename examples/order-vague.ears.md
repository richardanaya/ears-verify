# Vague words in an order requirement's description

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The checkout is fast, appropriate, and user-friendly." phrase "fulfill the order"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When not an order is submitted, the Order System shall not fulfill the order.
