# Release Provenance

Use release artifacts when handing this field integration to a customer or a
Forward operator who will run it from a controlled environment.

## Local Release Package

Build a source release archive and checksum manifest:

```bash
npm run release:package
```

Default output:

- `dist/release/forward-kentik-<version>.tgz`
- `dist/release/forward-kentik-release-manifest.json`
- `dist/release/SHA256SUMS`

Verify the archive before use:

```bash
cd dist/release
sha256sum -c SHA256SUMS
```

On macOS, use:

```bash
shasum -a 256 -c SHA256SUMS
```

## Optional Detached Signature

Generate an Ed25519 keypair on a controlled host:

```bash
npm run release:signing-key:generate -- --output-dir /secure/path/forward-kentik-release-signing
```

Sign `SHA256SUMS`:

```bash
npm run release:sign -- \
  --checksums dist/release/SHA256SUMS \
  --private-key /secure/path/forward-kentik-release-signing/release-ed25519-private.pem \
  --public-key-out dist/release/SHA256SUMS.pub
```

Verify:

```bash
npm run release:sign -- \
  --verify \
  --checksums dist/release/SHA256SUMS \
  --signature dist/release/SHA256SUMS.sig \
  --public-key /secure/path/forward-kentik-release-signing/release-ed25519-public.pem
```

The GitHub release workflow signs checksums when
`RELEASE_SIGNING_PRIVATE_KEY_PEM` is configured as a repository secret.

## Verification Order

1. Confirm CI passed for the source revision.
2. Build the release package from that revision.
3. Verify `SHA256SUMS`.
4. Inspect `forward-kentik-release-manifest.json`.
5. Run `npm ci` from the unpacked archive.
6. Run `npm run ci`.
7. Run Forward dry-run before any `--apply`.

## Current Boundary

This repository generates checksum-based provenance, optional detached checksum
signatures, and GitHub archive attestations. Container image provenance remains
future work unless a deployment requires an operated image.
