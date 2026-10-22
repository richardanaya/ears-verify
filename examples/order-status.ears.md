# The status would have to be shipped and cancelled at once.

enum Status { placed, shipped, cancelled }
output status: Status "Where the order stands." phrase "the status"

R6 The Order System shall the status is shipped.
R7 The Order System shall the status is cancelled.
