# Contributing

This project is currently developed in a private local sandbox. Public code contributions are not yet accepted. Because Model Steward uses separate noncommercial and commercial licensing, substantive contributions require an accepted contributor license agreement; see [`CONTRIBUTOR_LICENSE_AGREEMENT.md`](CONTRIBUTOR_LICENSE_AGREEMENT.md).

Development changes must:

1. preserve the no-proxy/no-credential/no-content-storage architecture;
2. include tests for routing and fallback behavior;
3. pass `npm run check`;
4. avoid adding runtime dependencies unless justified by a security review;
5. keep default mode as `observe`;
6. avoid publication or installation changes without owner authorization.
