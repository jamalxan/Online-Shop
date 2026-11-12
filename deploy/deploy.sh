#!/usr/bin/env bash
# Deploys origin/master on the server. Run by GitHub Actions over SSH (the CI key is
# restricted to this script) or by hand:  /srv/apexstore/app/deploy/deploy.sh
set -euo pipefail

STACK_DIR=/srv/apexstore
APP_DIR="$STACK_DIR/app"

# Everything lives in main() so bash has read the whole file before `git reset`
# replaces it on disk.
main() {
    cd "$APP_DIR"
    git fetch --quiet origin master
    git reset --quiet --hard origin/master
    echo "==> deploying $(git log --oneline -1)"

    cd "$STACK_DIR"
    local compose=(docker compose --project-directory "$STACK_DIR" -f "$APP_DIR/deploy/docker-compose.yml")

    echo "==> backend"
    "${compose[@]}" build backend
    # The entrypoint runs migrate + collectstatic; --wait blocks until /api/health/ answers
    "${compose[@]}" up -d --wait db redis backend

    echo "==> frontend (prerenders from the live API, so it is built after the backend is up)"
    "${compose[@]}" build frontend
    "${compose[@]}" up -d --wait frontend

    echo "==> cleanup"
    docker image prune -f --filter label=app=apexstore >/dev/null
    docker builder prune -f --filter until=168h >/dev/null

    "${compose[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
    echo "==> done"
}

main "$@"
