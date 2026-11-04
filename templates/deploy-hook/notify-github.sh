#!/usr/bin/env bash
#
# Announces a finished deployment to GitHub, which answers with the E2E workflow
# (.github/workflows/e2e.yml). Run it from any deployment tool that can call a command after a release
# has been activated, on one server only:
#
#     bash <release>/e2e/deploy-hook/notify-github.sh production <commit>
#
# Settings:
#   GITHUB_E2E_REPOSITORY  required: the repository that holds the workflow, as <owner>/<name>
#   GITHUB_E2E_TOKEN       a fine-grained GitHub token limited to that repository with "Contents: read and
#                          write" (what the repository-dispatch API asks for); when unset, it is read from
#                          ~/.config/magento-e2e/github-token (mode 0600)
#
# Needs curl 7.55 or later: the token reaches it on stdin, so it never appears in an argument list that
# any account on the host can read.
#
# The script never fails the deployment: a release that is already live is not rolled back because a
# notification could not be sent.

set -u

environment="${1:?usage: notify-github.sh <environment> <commit>}"
commit="${2:?usage: notify-github.sh <environment> <commit>}"
repository="${GITHUB_E2E_REPOSITORY:-}"
token_file="${HOME}/.config/magento-e2e/github-token"
token="${GITHUB_E2E_TOKEN:-}"

if [ -z "$repository" ]; then
    echo "e2e: GITHUB_E2E_REPOSITORY is not set (<owner>/<name>); the E2E run was not requested" >&2
    exit 0
fi

if [ -z "$token" ] && [ -r "$token_file" ]; then
    token="$(tr -d '[:space:]' < "$token_file")"
fi

if [ -z "$token" ]; then
    echo "e2e: no GitHub token (GITHUB_E2E_TOKEN or ${token_file}); the E2E run was not requested" >&2
    exit 0
fi

if printf 'Authorization: Bearer %s\n' "$token" | curl -fsS --max-time 20 -X POST "https://api.github.com/repos/${repository}/dispatches" \
    -H @- \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -d "{\"event_type\":\"site-deployed\",\"client_payload\":{\"environment\":\"${environment}\",\"sha\":\"${commit}\"}}"
then
    echo "e2e: requested the E2E run for ${environment} @ ${commit}"
else
    echo "e2e: GitHub did not accept the request; the E2E run was not requested" >&2
fi

exit 0
