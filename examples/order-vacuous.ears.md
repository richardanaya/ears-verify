# R1 contradicts itself. R2 asks for a quantity the declared range does not contain.

state cart_open: Bool "The cart is open." phrase "the cart is open"
input quantity: Int 1..5 "How many units the customer asked for." phrase "the quantity"
output order_accepted: Bool "The order is accepted." phrase "accept the order" outcome "the order was accepted" / "the order was not accepted"

R1 When the cart is open and not the cart is open, the Checkout shall accept the order.
R2 When the quantity is at least 9, the Checkout shall accept the order.
R3 The Checkout shall accept the order.
