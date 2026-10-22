# R2 repeats what R1 already requires.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When an order is submitted and inventory is available, the Order System shall fulfill the order.
R3 When an order is not submitted, the Order System shall not fulfill the order.
