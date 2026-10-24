# Either reason is enough to pack with care.

event rush_order: Bool "The customer asked for rush shipping." phrase "the order is rush"
event fragile_item: Bool "The item is fragile." phrase "the item is fragile"
output packed_carefully: Bool "The item is packed with care." phrase "pack the item with care" outcome "the item was packed with care" / "the item was not packed with care"

R1 When the order is rush or the item is fragile, the Warehouse shall pack the item with care.
