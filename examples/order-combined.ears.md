# Combined clauses

state inventory_available: Bool "Enough stock is on hand to fill the order." phrase "inventory is available"
event order_submitted: Bool "The customer submits an order." phrase "an order is submitted"
input quantity: Int 1..5 "How many units the customer asked for." phrase "the quantity"
enum Region { us, eu }
input region: Region "The region the order ships to." phrase "the region"
output shipped: Int 1..5 "How many units are shipped." phrase "the number shipped"

R1.2 While inventory is available, when an order is submitted, if the quantity is at least 1, where the region is us, then the Warehouse shall the number shipped is the quantity.
