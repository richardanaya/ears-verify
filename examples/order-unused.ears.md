# loyalty and region are never mentioned. refund is never mentioned.
# A receipt is only read, never set.

state cart_open: Bool "The cart is open." phrase "the cart is open"
state loyalty: Bool "The customer is in the loyalty program." phrase "the customer is loyal"
input region: Int 1..3 "The region code." phrase "the region"
enum Lane { hold, fulfill, refund }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane"
output receipt_sent: Bool "A receipt goes out." phrase "send a receipt" outcome "a receipt was sent" / "a receipt was not sent"

R1 When the cart is open and not send a receipt, the Checkout shall the lane is hold.
R2 When not the cart is open and not send a receipt, the Checkout shall the lane is fulfill.
R3 When send a receipt, the Checkout shall the lane is hold.
