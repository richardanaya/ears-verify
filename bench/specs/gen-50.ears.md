# Generated benchmark spec: 50 requirements, 10 desks, order amount 0..10.

input order_amount: Int 0..10 "How much the customer asks for." phrase "the order amount"
event amber_requested: Bool "A customer asks the amber desk for service." phrase "a amber request is made"
state amber_open: Bool "The amber desk is staffed." phrase "the amber desk is open"
output amber_approved: Bool "The amber request is approved." phrase "approve the amber request" outcome "the amber request was approved" / "the amber request was not approved"
output amber_points: Int 0..9 "How many amber points are granted." phrase "the amber points" as "grant {op} {value} amber points" says "{value} amber points were granted"
event birch_requested: Bool "A customer asks the birch desk for service." phrase "a birch request is made"
state birch_open: Bool "The birch desk is staffed." phrase "the birch desk is open"
output birch_approved: Bool "The birch request is approved." phrase "approve the birch request" outcome "the birch request was approved" / "the birch request was not approved"
output birch_points: Int 0..9 "How many birch points are granted." phrase "the birch points" as "grant {op} {value} birch points" says "{value} birch points were granted"
event cedar_requested: Bool "A customer asks the cedar desk for service." phrase "a cedar request is made"
state cedar_open: Bool "The cedar desk is staffed." phrase "the cedar desk is open"
output cedar_approved: Bool "The cedar request is approved." phrase "approve the cedar request" outcome "the cedar request was approved" / "the cedar request was not approved"
output cedar_points: Int 0..9 "How many cedar points are granted." phrase "the cedar points" as "grant {op} {value} cedar points" says "{value} cedar points were granted"
event dune_requested: Bool "A customer asks the dune desk for service." phrase "a dune request is made"
state dune_open: Bool "The dune desk is staffed." phrase "the dune desk is open"
output dune_approved: Bool "The dune request is approved." phrase "approve the dune request" outcome "the dune request was approved" / "the dune request was not approved"
output dune_points: Int 0..9 "How many dune points are granted." phrase "the dune points" as "grant {op} {value} dune points" says "{value} dune points were granted"
event ember_requested: Bool "A customer asks the ember desk for service." phrase "a ember request is made"
state ember_open: Bool "The ember desk is staffed." phrase "the ember desk is open"
output ember_approved: Bool "The ember request is approved." phrase "approve the ember request" outcome "the ember request was approved" / "the ember request was not approved"
output ember_points: Int 0..9 "How many ember points are granted." phrase "the ember points" as "grant {op} {value} ember points" says "{value} ember points were granted"
event fern_requested: Bool "A customer asks the fern desk for service." phrase "a fern request is made"
state fern_open: Bool "The fern desk is staffed." phrase "the fern desk is open"
output fern_approved: Bool "The fern request is approved." phrase "approve the fern request" outcome "the fern request was approved" / "the fern request was not approved"
output fern_points: Int 0..9 "How many fern points are granted." phrase "the fern points" as "grant {op} {value} fern points" says "{value} fern points were granted"
event glade_requested: Bool "A customer asks the glade desk for service." phrase "a glade request is made"
state glade_open: Bool "The glade desk is staffed." phrase "the glade desk is open"
output glade_approved: Bool "The glade request is approved." phrase "approve the glade request" outcome "the glade request was approved" / "the glade request was not approved"
output glade_points: Int 0..9 "How many glade points are granted." phrase "the glade points" as "grant {op} {value} glade points" says "{value} glade points were granted"
event harbor_requested: Bool "A customer asks the harbor desk for service." phrase "a harbor request is made"
state harbor_open: Bool "The harbor desk is staffed." phrase "the harbor desk is open"
output harbor_approved: Bool "The harbor request is approved." phrase "approve the harbor request" outcome "the harbor request was approved" / "the harbor request was not approved"
output harbor_points: Int 0..9 "How many harbor points are granted." phrase "the harbor points" as "grant {op} {value} harbor points" says "{value} harbor points were granted"
event iris_requested: Bool "A customer asks the iris desk for service." phrase "a iris request is made"
state iris_open: Bool "The iris desk is staffed." phrase "the iris desk is open"
output iris_approved: Bool "The iris request is approved." phrase "approve the iris request" outcome "the iris request was approved" / "the iris request was not approved"
output iris_points: Int 0..9 "How many iris points are granted." phrase "the iris points" as "grant {op} {value} iris points" says "{value} iris points were granted"
event juniper_requested: Bool "A customer asks the juniper desk for service." phrase "a juniper request is made"
state juniper_open: Bool "The juniper desk is staffed." phrase "the juniper desk is open"
output juniper_approved: Bool "The juniper request is approved." phrase "approve the juniper request" outcome "the juniper request was approved" / "the juniper request was not approved"
output juniper_points: Int 0..9 "How many juniper points are granted." phrase "the juniper points" as "grant {op} {value} juniper points" says "{value} juniper points were granted"

R1 While the amber desk is open, when a amber request is made, the Amber Desk shall approve the amber request.
R2 While the amber desk is not open, when a amber request is made, the Amber Desk shall not approve the amber request.
R3 When a amber request is made and the order amount is at least 6, the Amber Desk shall grant at most 5 amber points.
R4 When a amber request is made and the order amount is greater than 8, the Amber Desk shall grant 7 amber points.
R5 When a amber request is not made, the Amber Desk shall grant 0 amber points.
R6 While the birch desk is open, when a birch request is made, the Birch Desk shall approve the birch request.
R7 While the birch desk is not open, when a birch request is made, the Birch Desk shall not approve the birch request.
R8 When a birch request is made and the order amount is at least 6, the Birch Desk shall grant at most 5 birch points.
R9 When a birch request is made and the order amount is less than 2, the Birch Desk shall grant 2 birch points.
R10 When a birch request is not made, the Birch Desk shall grant 0 birch points.
R11 While the cedar desk is open, when a cedar request is made, the Cedar Desk shall approve the cedar request.
R12 While the cedar desk is not open, when a cedar request is made, the Cedar Desk shall not approve the cedar request.
R13 When a cedar request is made and the order amount is at least 6, the Cedar Desk shall grant at most 5 cedar points.
R14 When a cedar request is made and the order amount is less than 2, the Cedar Desk shall grant 2 cedar points.
R15 When a cedar request is not made, the Cedar Desk shall grant 0 cedar points.
R16 While the dune desk is open, when a dune request is made, the Dune Desk shall approve the dune request.
R17 While the dune desk is not open, when a dune request is made, the Dune Desk shall not approve the dune request.
R18 When a dune request is made and the order amount is at least 6, the Dune Desk shall grant at most 5 dune points.
R19 While the dune desk is open, when a dune request is made and the order amount is less than 2, the Dune Desk shall not approve the dune request.
R20 When a dune request is not made, the Dune Desk shall grant 0 dune points.
R21 While the ember desk is open, when a ember request is made, the Ember Desk shall approve the ember request.
R22 While the ember desk is not open, when a ember request is made, the Ember Desk shall not approve the ember request.
R23 When a ember request is made and the order amount is at least 6, the Ember Desk shall grant at most 5 ember points.
R24 When a ember request is made and the order amount is less than 2, the Ember Desk shall grant 2 ember points.
R25 When a ember request is not made, the Ember Desk shall grant 0 ember points.
R26 While the fern desk is open, when a fern request is made, the Fern Desk shall approve the fern request.
R27 While the fern desk is not open, when a fern request is made, the Fern Desk shall not approve the fern request.
R28 When a fern request is made and the order amount is at least 6, the Fern Desk shall grant at most 5 fern points.
R29 When a fern request is made and the order amount is less than 2, the Fern Desk shall grant 2 fern points.
R30 When a fern request is not made, the Fern Desk shall grant 0 fern points.
R31 While the glade desk is open, when a glade request is made, the Glade Desk shall approve the glade request.
R32 While the glade desk is not open, when a glade request is made, the Glade Desk shall not approve the glade request.
R33 When a glade request is made and the order amount is at least 6, the Glade Desk shall grant at most 5 glade points.
R34 When a glade request is made and the order amount is greater than 8, the Glade Desk shall grant 7 glade points.
R35 When a glade request is not made, the Glade Desk shall grant 0 glade points.
R36 While the harbor desk is open, when a harbor request is made, the Harbor Desk shall approve the harbor request.
R37 While the harbor desk is not open, when a harbor request is made, the Harbor Desk shall not approve the harbor request.
R38 When a harbor request is made and the order amount is at least 6, the Harbor Desk shall grant at most 5 harbor points.
R39 When a harbor request is made and the order amount is less than 2, the Harbor Desk shall grant 2 harbor points.
R40 When a harbor request is not made, the Harbor Desk shall grant 0 harbor points.
R41 While the iris desk is open, when a iris request is made, the Iris Desk shall approve the iris request.
R42 While the iris desk is not open, when a iris request is made, the Iris Desk shall not approve the iris request.
R43 When a iris request is made and the order amount is at least 6, the Iris Desk shall grant at most 5 iris points.
R44 When a iris request is made and the order amount is less than 2, the Iris Desk shall grant 2 iris points.
R45 When a iris request is not made, the Iris Desk shall grant 0 iris points.
R46 While the juniper desk is open, when a juniper request is made, the Juniper Desk shall approve the juniper request.
R47 While the juniper desk is not open, when a juniper request is made, the Juniper Desk shall not approve the juniper request.
R48 When a juniper request is made and the order amount is at least 6, the Juniper Desk shall grant at most 5 juniper points.
R49 While the juniper desk is open, when a juniper request is made and the order amount is less than 2, the Juniper Desk shall not approve the juniper request.
R50 When a juniper request is not made, the Juniper Desk shall grant 0 juniper points.
