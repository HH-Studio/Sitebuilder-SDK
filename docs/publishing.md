# Publishing the npm packages

## Local-only release path

Remote CI is forbidden. Package checks, asset creation, npm publishing and
release verification all run on the owner machine. No tag starts a workflow.

Publish `@snabbsajt/site-kit` first. The CLI dependency range begins at the same
Site Kit version, so reversing the order creates a broken install window.

The steps below read the version from `package.json` into `$VERSION` rather
than naming one. They used to spell `0.2.0` throughout, and by 0.3.0 the runbook
was verifying a release two versions old — the substitution was documented and
still nobody made it.

## One-time npm setup

1. Sign in at <https://www.npmjs.com/> and create or join the `snabbsajt`
   organization. The account must be allowed to publish public scoped packages.
2. Enable two-factor authentication for writes.
3. From this repository, authenticate with the same account:

   ```bash
   npm login --cache "$TMPDIR/npm-cache"
   npm whoami --cache "$TMPDIR/npm-cache"
   ```

The npm profile name and package scope are separate. Signing in as
`ludvighedin` does not grant access to `@snabbsajt`. Confirm the organization
exists and lists your account before publishing:

```bash
npm org ls snabbsajt --json --cache "$TMPDIR/npm-cache"
```

If that command or `npm publish` reports `E404 Scope not found`, create the
`snabbsajt` organization at <https://www.npmjs.com/org/create> while signed in
as `ludvighedin`, or have an existing owner add that account. Then rerun the
organization check. Do not rename the packages merely to bypass this setup.

If `npm publish` reports `E403` and says two-factor authentication is required,
the browser login succeeded but the account is not allowed to publish yet.
Enable **Authorization and writes** in npm Account → Two-Factor Authentication,
or run the interactive command below, then retry Site Kit:

```bash
npm profile enable-2fa auth-and-writes --cache "$TMPDIR/npm-cache"
```

Do not continue to the CLI after a failed Site Kit publication. The CLI's Site
Kit dependency range starts at the release version and cannot install correctly
until that version exists in the registry.

Never put an npm token in this repository, `.npmrc`, a screenshot, or a command
that will be committed.

## Release gate

Run from the repository root on `main` with a clean tree:

```bash
git pull --ff-only
bun install --frozen-lockfile
# Every step below reads the version from the manifest instead of naming one,
# so this runbook cannot go stale between releases the way it did at 0.2.0.
VERSION="$(node -p "require('./package.json').version")"

bun run check
bun run release:assets
npm pack --dry-run --json --cache "$TMPDIR/npm-cache"
npm pack --dry-run --json --workspace packages/cli --cache "$TMPDIR/npm-cache"
```

Confirm both manifests say `$VERSION`, the CLI dependency is either `$VERSION`
or the caret range `^$VERSION`, and neither tarball contains fixtures, source
credentials, customer data, or local configuration.

## 1. Publish Site Kit

The publishable Site Kit package is the repository root. Do not publish the
private `packages/site-kit` workspace link.

```bash
npm publish --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/site-kit@$VERSION version dist.integrity --json --prefer-online --cache "$TMPDIR/npm-cache"
```

Stop if the registry verification does not return `$VERSION` and an integrity
hash. Do not publish the CLI against a missing dependency.

## 2. Publish the CLI

```bash
npm publish --workspace packages/cli --access public --cache "$TMPDIR/npm-cache"
npm view @snabbsajt/cli@$VERSION version dependencies bin dist.integrity --json --prefer-online --cache "$TMPDIR/npm-cache"
```

The response must show the `snabbsajt` binary and a Site Kit dependency equal to
`$VERSION` or `^$VERSION`.

`--prefer-online` matters immediately after the first publication. Without it,
npm can reuse a cached pre-publication `E404` even though the registry already
contains the package.

## Clean-machine verification

```bash
tmp="$(mktemp -d)"
cd "$tmp"
npm init -y --cache "$TMPDIR/npm-cache"
npm install @snabbsajt/site-kit@$VERSION @snabbsajt/cli@$VERSION --cache "$TMPDIR/npm-cache"
npx @snabbsajt/cli@$VERSION site doctor --json
npx @snabbsajt/cli@$VERSION site init ./example --template html
npx @snabbsajt/cli@$VERSION site validate ./example
npx @snabbsajt/cli@$VERSION skills install --agent codex
npx @snabbsajt/cli@$VERSION skills doctor --agent codex
```

Only after that passes, create and push the matching Git tag and GitHub release:

```bash
git tag -a "v$VERSION" -m "SnabbSajt Site Kit and CLI $VERSION"
git push origin "v$VERSION"
gh release create "v$VERSION" release-assets/*.zip release-assets/SHA256SUMS.txt \
  --title "SnabbSajt Site Kit and CLI $VERSION" --generate-notes
```

Do not reuse or move an existing tag. npm versions are immutable; a broken
release is fixed with a new patch version, never by overwriting one already on npm.
