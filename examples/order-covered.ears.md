# Every situation has a response.

event order_submitted: Bool "The customer submits an order."
state inventory_available: Bool "Enough stock is on hand to fill the order."
output order_fulfilled: Bool "The order is fulfilled."

R1 When order_submitted and inventory_available, the Order System shall order_fulfilled.
R2 When order_submitted and not inventory_available, the Order System shall not order_fulfilled.
R3 When not order_submitted, the Order System shall not order_fulfilled.
