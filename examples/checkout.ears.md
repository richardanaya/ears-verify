# Checkout and a subscription.
# R4 contradicts R1. R8, R12, and R14 cannot all hold. R16 contradicts R15.
# A receipt is required only after payment and a confirmed address.
# Billed seats are left open when checkout starts and stock is not available.

event cart_opened: Bool "The customer opens the cart." phrase "the cart is open"
event item_added: Bool "The customer adds an item." phrase "an item is added"
event checkout_started: Bool "The customer starts checkout." phrase "checkout is started"
event payment_submitted: Bool "The customer submits payment." phrase "payment is submitted"
unwanted event payment_declined: Bool "The card is declined." phrase "payment is declined"
event address_confirmed: Bool "The customer confirms a shipping address." phrase "the address is confirmed"
event subscribe_clicked: Bool "The customer starts a subscription." phrase "the customer is subscribing"
event cancel_requested: Bool "The customer cancels the subscription." phrase "the customer is cancelling"
state signed_in: Bool "The customer is signed in." phrase "the customer is signed in"
state card_saved: Bool "A card is on file." phrase "a card is saved"
state stock_ok: Bool "The warehouse can fill the cart." phrase "stock is available"
output order_accepted: Bool "The order is accepted." phrase "accept the order" outcome "the order was accepted" / "the order was not accepted"
output order_rejected: Bool "The order is rejected." phrase "reject the order" outcome "the order was rejected" / "the order was not rejected"
output subscription_started: Bool "A subscription begins." phrase "the subscription is started" action "start the subscription" outcome "the subscription was started" / "the subscription was not started"
output receipt_sent: Bool "A receipt goes out." phrase "send a receipt" outcome "a receipt was sent" / "a receipt was not sent"
enum Lane { hold, fulfill }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"
output billed_seats: Int 1..3 "How many seats are billed." phrase "the billed seats" as "bill {op} {value} seats" says "{value} seats were billed"

R1 When payment is submitted and the address is confirmed, the Checkout shall accept the order.
R2 When payment is submitted and the address is not confirmed, the Checkout shall not accept the order.
R3 When payment is not submitted, the Checkout shall not accept the order.
R4 When payment is submitted and the address is confirmed, the Checkout shall not accept the order.
R5 When payment is submitted and the address is confirmed, the Checkout shall send a receipt.
R6 If payment is declined, then the Checkout shall reject the order.
R7 If payment is not declined, then the Checkout shall not reject the order.
R8 When the customer is subscribing and the customer is not cancelling and the customer is signed in, the Checkout shall start the subscription.
R9 When the customer is not subscribing, the Checkout shall not start the subscription.
R10 When the customer is cancelling, the Checkout shall not start the subscription.
R11 When the customer is subscribing and the customer is not cancelling and the customer is not signed in, the Checkout shall not start the subscription.
R12 When the subscription is started, the Checkout shall route the order to the fulfill lane.
R13 When the subscription is not started, the Checkout shall route the order to the hold lane.
R14 When the customer is subscribing, the Checkout shall route the order to the hold lane.
R15 When checkout is started and stock is available, the Checkout shall bill at most 2 seats.
R16 When checkout is started and stock is available, the Checkout shall bill 3 seats.
R17 When checkout is not started, the Checkout shall bill 1 seat.
R18 When payment is submitted and the address is confirmed and the customer is signed in, the Checkout shall accept the order.
R19 When payment is submitted and the address is confirmed and a card is saved, the Checkout shall accept the order.
R20 When payment is submitted and the address is confirmed and stock is available, the Checkout shall accept the order.
R21 When payment is submitted and the address is confirmed and the cart is open, the Checkout shall accept the order.
R22 When payment is submitted and the address is confirmed and an item is added, the Checkout shall accept the order.
R23 When payment is submitted and the address is confirmed and checkout is started, the Checkout shall accept the order.
R24 When payment is submitted and the address is confirmed and the customer is subscribing, the Checkout shall accept the order.
R25 When payment is submitted and the address is not confirmed and the customer is signed in, the Checkout shall not accept the order.
R26 When payment is submitted and the address is not confirmed and the cart is open, the Checkout shall not accept the order.
R27 When payment is submitted and the address is not confirmed and an item is added, the Checkout shall not accept the order.
R28 When payment is submitted and the address is not confirmed and a card is saved, the Checkout shall not accept the order.
R29 When payment is not submitted and the cart is open, the Checkout shall not accept the order.
R30 When payment is not submitted and an item is added, the Checkout shall not accept the order.
R31 When payment is not submitted and checkout is started, the Checkout shall not accept the order.
R32 When payment is not submitted and the customer is signed in, the Checkout shall not accept the order.
R33 When payment is not submitted and a card is saved, the Checkout shall not accept the order.
R34 When payment is not submitted and stock is available, the Checkout shall not accept the order.
R35 When payment is not submitted and the customer is subscribing, the Checkout shall not accept the order.
R36 When the customer is subscribing and the customer is not cancelling and the customer is signed in and a card is saved, the Checkout shall start the subscription.
R37 When the customer is subscribing and the customer is not cancelling and the customer is signed in and the cart is open, the Checkout shall start the subscription.
R38 When the customer is subscribing and the customer is not cancelling and the customer is signed in and an item is added, the Checkout shall start the subscription.
R39 When the customer is subscribing and the customer is cancelling, the Checkout shall not start the subscription.
R40 When the customer is cancelling and the cart is open, the Checkout shall not start the subscription.
R41 When the customer is cancelling and an item is added, the Checkout shall not start the subscription.
R42 When the customer is not subscribing and the cart is open, the Checkout shall not start the subscription.
R43 When the customer is not subscribing and an item is added, the Checkout shall not start the subscription.
R44 When the customer is not subscribing and a card is saved, the Checkout shall not start the subscription.
R45 When the customer is subscribing and the customer is not cancelling and the customer is not signed in and the cart is open, the Checkout shall not start the subscription.
R46 When the subscription is not started and the cart is open, the Checkout shall route the order to the hold lane.
R47 When the subscription is not started and an item is added, the Checkout shall route the order to the hold lane.
R48 When the subscription is started and a card is saved, the Checkout shall route the order to the fulfill lane.
R49 When payment is submitted and the address is confirmed and the customer is signed in, the Checkout shall send a receipt.
R50 When payment is submitted and the address is confirmed and the cart is open, the Checkout shall send a receipt.
