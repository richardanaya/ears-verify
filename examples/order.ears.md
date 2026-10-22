# Order fulfillment

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order"

R1 WHEN an order is submitted AND inventory is available, THE Order System SHALL fulfill the order.
