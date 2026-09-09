---
sidebar_position: 5
title: Community schemas
description: Search, inspect, and install community capability schemas.
---

# Use community schemas

```bash
clip registry search github
clip schema show gh
clip registry add gh --purpose "Review pull requests"
clip sync
```

The [tool directory](/tools) and CLI share a Git-backed catalog. Entries include a maintainer, schema version, source links, coverage, and a SHA-256 digest. CLIP verifies the digest before installing a schema. The executable must already be installed.

The first release bundles the catalog for offline use. Upgrade CLIP to get catalog updates, then reinstall an entry and sync to update its generated skills. You can always register a newer local schema with `--schema`.

[Contribute a schema](https://github.com/mcclowes/clip/blob/main/CONTRIBUTING.md) through a pull request. The directory starts with a small, documented set of tools, without fabricated install counts or rankings.
