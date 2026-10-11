#!/bin/sh
# Docker creates a missing bind-mounted ./data as root: hand it to the unprivileged user,
# then drop root before starting the server.
set -e
if [ "$(id -u)" = 0 ]; then
  if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
    chown node:node "$DATA_DIR"
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
