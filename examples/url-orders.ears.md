# Orders page

// The orders page for a customer is served securely on example.com or one of its subdomains, filtered by status. The URL has no userinfo, no port, and no fragment.

R1 The Shop shall url.scheme = "https".
R2 The Shop shall url.userinfo is empty.
R3 The Shop shall url.host = "example.com" or url.host ends with ".example.com".
R4 The Shop shall url.port is empty.
R5 The Shop shall url.path = "/customers/{customerId}/orders".
R6 The Shop shall url.query = "status={status}".
R7 The Shop shall url.fragment is empty.
