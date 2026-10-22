# Vague words and solution words.

event order_submitted: Bool "The customer submits an order."
output order_fulfilled: Bool "The system responds quickly."
state saved: Bool "Store the order in the database."

R1 When order_submitted, the Order System shall order_fulfilled.
R2 When not order_submitted, the Order System shall not order_fulfilled.
