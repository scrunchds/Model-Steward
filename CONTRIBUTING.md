# Contributing

This project is currently developed in a private local sandbox. Public contributions are not yet accepted.

Development changes must:

1. preserve the no-proxy/no-credential/no-content-storage architecture;
2. include tests for routing and fallback behavior;
3. pass `npm run check`;
4. avoid adding runtime dependencies unless justified by a security review;
5. keep default mode as `observe`;
6. avoid publication or installation changes without owner authorization.
