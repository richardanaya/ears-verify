# Every lane value can be produced.

state cart_open: Bool "The cart is open." phrase "the cart is open"
enum Lane { hold, fulfill }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"

R1 When the cart is open, the Checkout shall route the order to the hold lane.
R2 When the cart is not open, the Checkout shall route the order to the fulfill lane.
