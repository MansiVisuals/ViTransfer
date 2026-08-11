# Release automation (maintenance mode)

ViTransfer ships security patches weekly and little else. The pipeline below
runs itself; the only recurring human action is approving the publish.

## The weekly cycle

| When | What | Where |
| --- | --- | --- |
| Mon 05:00 UTC | Dependabot opens PRs against `dev` | `.github/dependabot.yml` |
| on each PR | 19 clean-install + 22 upgrade tests build from source and run against real compose stacks | `docker-integration-tests.yml` |
| tests green | eligible PRs squash-merge into `dev` | `dependabot-auto-merge.yml` |
| Mon 08:00 UTC | version bump, changelog, `dev` → `main`, multi-arch build, tag, release | `weekly-security-release.yml` |
| release published | clean-install and upgrade tests re-run against the **published** Docker Hub images | `test-clean-install.yml`, `test-upgrade.yml` |

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
annotation if advisories remain unresolved. Check it before approving — that is
what surfaces an advisory whose only fix is a major.

## Approving a release

The `publish` job targets the `release` environment, which requires a review.
GitHub notifies you; open the run and click **Review deployments → Approve**.
Nothing reaches Docker Hub before that click.

Approval happens *before* the image build rather than after. The build is
already proven at that point: every PR that landed on `dev` built the image from
source and ran the full suite against it.

After approval the job, in order:

1. bumps `VERSION`, `package.json`, `package-lock.json` (patch, e.g. 1.2.7 → 1.2.8)
2. prepends a `### Security` entry to `CHANGELOG.md` from the merged commit subjects
3. pushes `dev`, merges `dev` → `main`, pushes `main`
4. builds `linux/amd64` + `linux/arm64` with `--no-cache` and pushes both
   `mansivisuals/vitransfer:<version>` and `:latest`
5. creates tag `v<version>` and publishes the GitHub release

Images are pushed before the release is published so the release-triggered tests
have something to pull.

## One-off setup

Repo settings already applied: auto-merge enabled, `release` environment with
required reviewer and a `main` branch policy, `dev` protected on the
`Test Summary` check (`enforce_admins: false`, so admin pushes to `dev` still
work), `ci` and `needs-manual-review` labels created.

Still required:

1. **Docker Hub secrets.** Create an access token with Read/Write on Docker Hub, then:
   ```bash
   gh secret set DOCKERHUB_USERNAME --body 'mansivisuals'
   gh secret set DOCKERHUB_TOKEN    # paste the token when prompted
   ```
   Without these the publish job fails at login.

2. **Resume Dependabot.** Security updates are currently `paused` — GitHub pauses
   them after a long stretch of ignored PRs, which is why 7 open alerts produced
   zero PRs. The API cannot clear it. Go to **Security → Dependabot** and use the
   resume prompt, or merge/close one Dependabot PR by hand.

3. **Merge these workflows to `main`.** Scheduled workflows run from the default
   branch, so the Monday cron does not exist until `weekly-security-release.yml`
   is on `main`.

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
