# Combined clauses

state inventory_available: Bool "Enough stock is on hand to fill the order."
event order_submitted: Bool "The customer submits an order."
input quantity: Int 1..5 "How many units the customer asked for."
enum Region { us, eu }
input region: Region "The region the order ships to."
output shipped: Int 1..5 "How many units are shipped."

R1.2 While inventory_available, when order_submitted, if quantity >= 1, where region = us, then the Warehouse shall shipped = quantity.
