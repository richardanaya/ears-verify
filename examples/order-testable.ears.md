# The same order, written so a scenario can check it.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output receipt_sent: Bool "A receipt is sent." phrase "send a receipt" outcome "a receipt was sent" / "a receipt was not sent"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When an order is submitted, the Order System shall send a receipt.
R3 When an order is not submitted, the Order System shall not fulfill the order.
R4 When an order is not submitted, the Order System shall not send a receipt.
