# Threat Model

## Protected assets

- provider credentials and authentication state
- private prompts, responses, source code, and tool data
- model selection integrity
- user budget and provider quotas
- availability of the host coding agent

## Trust boundaries

Model Steward trusts the host Pi model registry for model identity, availability, authentication, and invocation. It does not cross the provider transport boundary.

Project configuration is trusted only in trusted projects. Local observation files are considered sensitive metadata even though they exclude content.

## Principal threats and controls

| Threat                       | Control                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Prompt/source disclosure     | Content is never recorded; no traffic interception                                     |
| Credential disclosure        | Credentials are never requested or handled                                             |
| Malicious custom endpoint    | Pi retains endpoint/auth responsibility; candidates require explicit configuration     |
| Surprise spending            | New models are not auto-enabled; exploration is bounded                                |
| Weak model on sensitive work | High-risk allowlist fails closed                                                       |
| Provider/model outage        | Circuit breaker and ordered fallback                                                   |
| Steward failure blocks work  | Catch-all fail-open to Pi's current model                                              |
| Poisoned telemetry           | Structured schema, secret-like rejection, manual feedback is additive and attributable |
| Cross-provider cache leak    | No LLM response cache exists                                                           |
| Public release by mistake    | Private package, no remote, release guard, explicit approval policy                    |

## Non-goals

Model Steward does not sandbox model providers, verify provider claims, or decide whether a custom endpoint itself is trustworthy.
