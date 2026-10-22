# Vague words and solution words.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The system responds quickly." phrase "fulfill the order"
state saved: Bool "Store the order in the database." phrase "the order is saved"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When not an order is submitted, the Order System shall not fulfill the order.
