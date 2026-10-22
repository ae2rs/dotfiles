---
description: Slack bump message for the infra PR, copied to the clipboard
---

Prepare the Slack message announcing the infrastructure PR's image bump: the one from this session, or else the current branch of ~/work/infrastructure. Take the services from its diff of `production/applications/versions/versions.go`: every `Overrides` key whose hash changed, plus every service that points at a shared hash variable (such as `BumpyHash`) that changed. If `ReleaseHash` changed, stop and ask me.

The message is one line, the services in the file's order, nothing else:

:bump: `name-api` `name-2-api`

Copy it to the clipboard with `printf '%s' '<message>' | pbcopy`, then show me the message.
