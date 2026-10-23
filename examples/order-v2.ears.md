# Order fulfillment, revised

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"

R1 WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
R2 WHEN an order is submitted AND inventory is not available, THE Order System SHALL not fulfill the order.
R3 WHEN an order is not submitted, THE Order System SHALL not fulfill the order.
