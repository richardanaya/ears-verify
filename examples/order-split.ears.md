# One response names two outputs.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output receipt_sent: Bool "A receipt is sent." phrase "send a receipt" outcome "a receipt was sent" / "a receipt was not sent"

R1 When an order is submitted, the Order System shall fulfill the order and send a receipt.
R2 When an order is not submitted, the Order System shall not fulfill the order and not send a receipt.
