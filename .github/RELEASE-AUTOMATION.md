# Release automation (maintenance mode)

ViTransfer ships security patches weekly and little else. The pipeline below
runs itself end to end. There is no recurring human action.

## The weekly cycle

| When | What | Where |
| --- | --- | --- |
| Mon 05:00 UTC | Dependabot opens PRs against `dev` | `.github/dependabot.yml` |
| on each PR | 19 clean-install + 22 upgrade tests build from source and run against real compose stacks | `docker-integration-tests.yml` |
| | *(PR only — running on push to dev as well ran the same suite twice per merge)* | |
| tests green | eligible PRs squash-merge into `dev` | `dependabot-auto-merge.yml` |
| Mon 08:00 UTC | clean install re-run against `dev`, then version bump, changelog, `dev` → `main`, multi-arch build, tag, release | `weekly-security-release.yml` |
| after publish | clean install runs against the **published** Docker Hub image | `test-clean-install.yml` |

A week with no commits on `dev` is skipped silently — no bump, no tag, no release.

## What auto-merges

`dependabot-auto-merge.yml` queues a PR with `gh pr merge --auto`, which merges
only after `Test Summary` passes.

| Ecosystem | Auto-merges | Left for a human |
| --- | --- | --- |
| npm | patch, minor | major |
| github-actions | patch, minor | major |
| docker | patch, minor | major |

Majors never merge unattended, security ones included. `dependabot.yml` ignores
them outright, so they do not open as PRs. Anything else held back gets the
`needs-manual-review` label and a comment saying why.

The release run executes `npm audit --audit-level=high` and emits a warning
annotation if advisories remain unresolved. That is what surfaces an advisory
whose only fix is a major, so it is worth reading the run summary.

## How a release gets published

Nothing waits on a human. Publishing is gated on tests instead:

`verify-clean-install` re-runs the clean-install suite against `dev` before
anything is published. Required checks on `dev` are not strict, so each PR was
tested against `dev` as it stood when the PR opened, not against the final
merged tree; this tests the exact tree about to ship. If it fails, nothing is
published and an issue is opened.

Coverage is deliberately one layer deep at each stage rather than three. The
full clean-install and upgrade suites still run on every PR, which is where a
schema or code change actually arrives. Re-running all of it twice more per
release bought little and cost roughly 25 minutes a week.

Once it passes, the job runs in order:

1. bumps `VERSION`, `package.json`, `package-lock.json` (patch, e.g. 1.2.7 → 1.2.8)
2. prepends a `### Security` entry to `CHANGELOG.md` from the merged commit subjects
3. pushes `dev`, merges `dev` → `main`, pushes `main`
4. builds `linux/amd64` + `linux/arm64` with `--no-cache` and pushes both
   `mansivisuals/vitransfer:<version>` and `:latest`
5. creates tag `v<version>` and publishes the GitHub release

Images are pushed before the release is published. Afterwards
`post-release-clean-install` pulls the published image from Docker Hub — the
only check that the manifest itself is well formed and boots.

To put a human back in the loop, add `environment: release` to the `publish`
job. The environment still exists with a required reviewer.

## One-off setup

Repo settings already applied: auto-merge enabled, `dev` protected on the
`Test Summary` check (`enforce_admins: false`, so admin pushes to `dev` still
work), `ci` and `needs-manual-review` labels created.

`DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set as repository secrets; the
publish job fails at login without them.

## Operating it

```bash
# dry run without waiting for Monday
gh workflow run weekly-security-release.yml

# force a release when dev has no new commits
gh workflow run weekly-security-release.yml -f force=true

# see what is queued
gh pr list --author 'app/dependabot'
gh pr list --label needs-manual-review
```

Failures open an issue labelled `ci` with a link to the run.

## Turning it off

```bash
# stop the weekly release only
gh workflow disable weekly-security-release.yml

# stop unattended merges
gh workflow disable dependabot-auto-merge.yml

# drop the required check on dev
gh api -X DELETE repos/:owner/:repo/branches/dev/protection
```
