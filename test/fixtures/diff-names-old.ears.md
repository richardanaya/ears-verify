event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
output refund_issued: Bool "A refund was issued." phrase "issue a refund" outcome "a refund was issued" / "a refund was not issued"

R1 When an order is not submitted, the Order System shall not fulfill the order.
R2 When an order is submitted, the Order System shall issue a refund.
