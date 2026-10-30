---
description: Slack bump message for the infra PR, as a draft in #backend-release
---

Prepare the Slack message announcing the infrastructure PR's image bump: the one from this session, or else the current branch of ~/work/infrastructure. Take the services from its diff of `production/applications/versions/versions.go`: every `Overrides` key whose hash changed, plus every service that points at a shared hash variable (such as `BumpyHash`) that changed. If `ReleaseHash` changed, stop and ask me.

The message is one line, the services in the file's order, each wrapped in backticks, nothing else:

:bump: `name-api` `name-2-api`

Create it as a Slack draft, not a sent message, with `slack_send_message_draft` in #backend-release (channel ID `C0ALZF3FVA8`). If a draft already exists there, stop and tell me. Then show me the message and the channel link.
