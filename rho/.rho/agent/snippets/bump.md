---
description: send the Slack bump message for the infra PR in #backend-release
---

Send the Slack bump message for the infrastructure PR, following "Post the bump message" in section 5 of the deploy-monorepo skill: the PR from this session, or else the current branch of ~/work/infrastructure. Take the services from the PR's diff of `versions.go`: every `Overrides` key whose hash changed, plus every service that points at a shared hash variable that changed. If `ReleaseHash` changed, ask me instead. Then show me the message and its link.
