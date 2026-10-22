# "as needed" is free text. "respond quickly" is a declared phrase, so that wording is bound.

event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "Handle it as needed." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output shipped: Bool "The order left the building." phrase "respond quickly" outcome "the order was shipped quickly" / "the order was not shipped quickly"

R1 When an order is submitted, the Order System shall fulfill the order.
R2 When an order is not submitted, the Order System shall not fulfill the order.
R3 When an order is submitted, the Order System shall respond quickly.
R4 When an order is not submitted, the Order System shall not respond quickly.
