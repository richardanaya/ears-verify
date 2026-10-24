# The same desk, with a trigger that can happen.

state desk_ready: Bool "The desk is staffed." phrase "the desk is ready"
output job_done: Bool "The job is finished." phrase "finish the job" outcome "the job was finished" / "the job was not finished"

R1 When the desk is ready, the Desk shall finish the job.
R2 When the desk is not ready, the Desk shall not finish the job.
