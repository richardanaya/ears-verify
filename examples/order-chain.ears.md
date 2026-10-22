# Three requirements clash only as a set.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_accepted: Bool "The order is accepted." phrase "accept the order" outcome "the order was accepted" / "the order was not accepted"
output order_shipped: Bool "The order is shipped." phrase "ship the order" outcome "the order was shipped" / "the order was not shipped"

R1 When an order is submitted, the Order System shall accept the order.
R2 When accept the order, the Order System shall ship the order.
R3 When an order is submitted, the Order System shall not ship the order.
