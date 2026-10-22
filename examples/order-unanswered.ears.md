# An error condition with no stated response

unwanted event payment_declined: Bool "The payment was declined." phrase "payment fails"
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When not an order is submitted, the Order System shall not fulfill the order.
