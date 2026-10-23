enum Status { placed, shipped, cancelled }
output status: Status "Where the order stands." phrase "the status" as "mark the order {value}" says "the order was {value}"

R1 The Order System shall mark the order cancelled.
