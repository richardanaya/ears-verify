event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
output order_fulfilled: Bool "The order is fulfilled." phrase "fulfill the order" outcome "the order was fulfilled" / "the order was not fulfilled"
input priority: Int 1..3 "How urgent the order is." phrase "the priority" as "set the priority {op} {value}" says "the priority was {value}"

R1 When an order is not submitted, the Order System shall not fulfill the order.
