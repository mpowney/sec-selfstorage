#!/bin/sh
# Ensure the data directory is owned by the node user before starting.
# This handles the case where a host bind mount creates the directory as root.
chown node:node /app/data
exec su-exec node "$@"
