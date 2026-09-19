# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub security advisories](https://github.com/mcclowes/clip/security/advisories/new). Don't open a public issue.

Include the CLIP version, your OS, steps to reproduce, and the impact you expect. You should get an acknowledgement within 5 working days. We'll agree a disclosure date with you once a fix is ready, and credit you in the advisory unless you'd rather not be named.

## Supported versions

Only the latest release gets security fixes. CLIP is pre-1.0, so upgrade to receive them.

## Threat model

CLIP writes files that agents read and act on, so a flaw can change what an agent does. These are the boundaries we treat as security-relevant:

- **Execution.** CLIP never runs a registered tool on the user's behalf. The only thing it executes is a native probe the user explicitly registered with `--probe`. Probes run without a shell and are limited to five seconds and 1 MiB of output. Anything that makes CLIP execute other commands, or escape those limits, is a vulnerability.
- **Schemas are data.** A capability schema, from the bundled registry or a local file, must not be able to inject instructions into a generated skill that go beyond describing the tool. It must also not be able to write outside the skills directory or overwrite files CLIP doesn't own.
- **Registry integrity.** Bundled schemas are pinned by SHA-256 digest. A schema that loads despite a digest mismatch is a vulnerability.
- **Authorization.** Schemas describe capabilities; they never grant permissions. A `mutating: false` marker that is wrong is a schema bug, and should be reported as an issue or fixed in a pull request.

Out of scope: vulnerabilities in the tools CLIP describes, and anything an agent does with a tool the user has already authorized it to run.
