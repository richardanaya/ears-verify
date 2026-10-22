# An unwanted event written with when.

unwanted event payment_declined: Bool "The payment was declined." phrase "payment fails"
output order_rejected: Bool "The order is rejected." phrase "reject the order"

R4 When payment fails, the Order System shall reject the order.
R5 The Order System shall reject the order.
