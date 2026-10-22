# loyalty and region are never mentioned. refund is never mentioned.
# A receipt is only read, never set.

state cart_open: Bool "The cart is open." phrase "the cart is open"
state loyalty: Bool "The customer is in the loyalty program." phrase "the customer is loyal"
input region: Int 1..3 "The region code." phrase "the region"
enum Lane { hold, fulfill, refund }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"
output receipt_sent: Bool "A receipt goes out." phrase "a receipt is sent" action "send a receipt" outcome "a receipt was sent" / "a receipt was not sent"

R1 When the cart is open and a receipt is not sent, the Checkout shall route the order to the hold lane.
R2 When the cart is not open and a receipt is not sent, the Checkout shall route the order to the fulfill lane.
R3 When a receipt is sent, the Checkout shall route the order to the hold lane.
