# Unwanted events use if, then.

unwanted event payment_declined: Bool "The payment was declined."
output order_rejected: Bool "The order is rejected."

R4 If payment_declined, then the Order System shall order_rejected.
R5 If not payment_declined, then the Order System shall not order_rejected.
