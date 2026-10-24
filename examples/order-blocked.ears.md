# R1 and R2 are always true, so R3 can never fire.

output gate_open: Bool "The gate stays open." phrase "the gate is open" action "open the gate" outcome "the gate was opened" / "the gate stayed closed"
output shift_open: Bool "The shift stays open." phrase "the shift is open" action "open the shift" outcome "the shift was opened" / "the shift stayed closed"
output job_done: Bool "The job is finished." phrase "finish the job" outcome "the job was finished" / "the job was not finished"

R1 The Desk shall not open the gate.
R2 The Desk shall not open the shift.
R3 When the gate is open or the shift is open, the Desk shall finish the job.
R4 When the gate is not open and the shift is not open, the Desk shall not finish the job.
