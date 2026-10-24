event ready: Bool "The desk is ready." phrase "the desk is ready"
output sent: Bool "The desk sends the notice." phrase "send the notice" outcome "the notice was sent" / "the notice was not sent"
output logged: Bool "The desk logs the day." phrase "log the day" outcome "the day was logged" / "the day was not logged"

R1 The Desk shall log the day.
R2 When the desk is ready, the Desk shall send the notice.
