# Loyalty is never mentioned. A receipt is only read. The refund lane can never be produced.

state loyalty: Bool "The customer is in the loyalty program." phrase "the customer is loyal"
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output receipt_sent: Bool "A receipt goes out." phrase "a receipt is sent"
enum Lane { hold, fulfill, refund }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"

R1 When an order is submitted and a receipt is sent, the Checkout shall fulfill the order.
R2 When an order is submitted and a receipt is not sent, the Checkout shall fulfill the order.
R3 When an order is not submitted and a receipt is sent, the Checkout shall not fulfill the order.
R4 When an order is not submitted and a receipt is not sent, the Checkout shall not fulfill the order.
R5 When an order is submitted, the Checkout shall route the order to the hold lane.
R6 When an order is not submitted, the Checkout shall route the order to the fulfill lane.
