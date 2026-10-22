# The response and the trigger are the old awkward shape. Lint names both.

state subscription_started: Bool "A subscription begins." phrase "the subscription is started" action "start the subscription"
enum Lane { hold, fulfill }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"

R1 When start the subscription, the Checkout shall the lane is fulfill.
R2 When not start the subscription, the Checkout shall the lane is hold.
