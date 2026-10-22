# URL safety

<!-- Outbound fetches must name an allowlisted host, carry no credentials, and pin a port when they leave that host. -->

R1.1 The url-parser shall reject a non-empty userinfo.

R1.2 The url-parser shall accept only host "example.com".

R1.3 When scheme is "https", if host is not "example.com", the url-parser shall require an explicit port of 443.
