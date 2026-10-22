# Two requirements disagree about a submitted order.

event order_submitted: Bool "The customer submits an order."
output order_fulfilled: Bool "The order is fulfilled."

R1 When not order_submitted, the Order System shall not order_fulfilled.
R2 When order_submitted, the Order System shall order_fulfilled.
R3 When order_submitted, the Order System shall not order_fulfilled.
