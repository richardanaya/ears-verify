# R5 repeats R4. R1 conflicts with R2, and that clash does not hide the repeat.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output order_closed: Bool "The order is closed." phrase "close the order" outcome "the order was closed" / "the order was not closed"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When an order is submitted, the Order System shall not fulfill the order.
R3 When an order is not submitted, the Order System shall not fulfill the order.
R4 When an order is submitted, the Order System shall close the order.
R5 When an order is submitted and inventory is available, the Order System shall close the order.
R6 When an order is not submitted, the Order System shall not close the order.
