# Security Policy

## Supported version

Security fixes target the current `main` branch and the version deployed through GitHub Pages. Older commits and local copies are not maintained as separate release lines.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's security advisory form](https://github.com/nesleykent/Bestie/security/advisories/new). Do not open a public issue for a vulnerability that could expose or corrupt player data or make other visitors unsafe.

Useful reports include:

- the affected page, file, or commit;
- reproduction steps and a minimal proof of concept;
- the security impact and conditions required to trigger it;
- any suggested remediation;
- whether the issue is already public.

Remove real character names, Hunt Analyzer logs, or other personal information unless they are strictly required to reproduce the problem.

## Relevant security boundaries

The application is a static, local-first browser application with no Tibia login and no application backend. Its main security-sensitive surfaces are:

- rendering pasted Hunt Analyzer text and imported progress safely;
- preserving the integrity of browser-stored tracker and session data;
- validating CSV and JSON imports without trusting canonical game fields from them;
- avoiding unsafe links, script injection, and unintended data transmission;
- protecting the GitHub Pages build and deployment workflow.

Incorrect game data, calculation errors, and ordinary UI defects are bugs rather than security vulnerabilities unless they cross one of these boundaries.
