# Unwanted events use if, then.

unwanted event payment_declined: Bool "The payment was declined." phrase "payment fails"
output order_rejected: Bool "The order is rejected." phrase "reject the order"

R4 If payment fails, then the Order System shall reject the order.
R5 If not payment fails, then the Order System shall not reject the order.
