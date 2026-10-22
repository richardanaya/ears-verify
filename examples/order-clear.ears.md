# The same checkout lane, written so a reader can say it out loud.

state subscription_started: Bool "A subscription begins." phrase "the subscription is started" action "start the subscription"
enum Lane { hold, fulfill }
output lane: Lane "Whether the warehouse holds or fulfills." phrase "the lane" as "route the order to the {value} lane" says "the order was routed to the {value} lane"

R1 When the subscription is started, the Checkout shall route the order to the fulfill lane.
R2 When the subscription is not started, the Checkout shall route the order to the hold lane.
