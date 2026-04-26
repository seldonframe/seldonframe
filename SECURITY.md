# Security Policy

## Supported versions

SeldonFrame is pre-1.0. We support the latest `main` branch and the most recent tagged release. Older versions do not receive security patches — please upgrade.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest tagged release | Yes |
| Older releases | No |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, email **max@seldonframe.com** with:

- A description of the vulnerability
- Steps to reproduce
- The affected component or file paths
- Your assessment of impact and severity
- Any suggested mitigation

You should receive an acknowledgment within 72 hours. We aim to triage and respond with a remediation plan within 7 days.

## Disclosure process

1. You report the issue privately to the email above.
2. We confirm the issue and determine severity.
3. We develop and test a fix in a private branch.
4. We release the fix and publish a security advisory crediting the reporter (unless anonymity is requested).

## Out of scope

- Vulnerabilities in dependencies that have already been disclosed upstream — please file those with the upstream project.
- Issues requiring physical access to a user's device.
- Social engineering of SeldonFrame staff or users.
- Self-XSS that requires the victim to paste attacker-controlled code into their own console.

## Thank you

Responsible disclosure makes SeldonFrame safer for everyone. We're grateful for the time and effort security researchers put into reviewing the project.
