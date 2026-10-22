# The status would have to be shipped and cancelled at once.

enum Status { placed, shipped, cancelled }
output status: Status "Where the order stands." phrase "the status" as "mark the order {value}" says "the order was {value}"

R6 The Order System shall mark the order shipped.
R7 The Order System shall mark the order cancelled.
