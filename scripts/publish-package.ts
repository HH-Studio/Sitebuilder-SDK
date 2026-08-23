import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REGISTRY_ORIGIN = "https://registry.npmjs.org";

type PackageManifest = {
  name?: unknown;
  version?: unknown;
};

export type PublishedPackageState = "missing" | "verified";

/** `npm publish` on a private manifest prints a full, convincing tarball notice, warns
 *  that it skipped the workspace, and exits 0. That is how `@snabbsajt/site-kit@0.4.0`
 *  appeared to ship while the registry still held 0.3.0, and `npm install @snabbsajt/cli`
 *  died with ETARGET for seven hours. There are two manifests named `@snabbsajt/site-kit`:
 *  the real one at the SDK root, and a `"private": true` workspace link at
 *  `packages/site-kit/`. Refuse the private one before npm can shrug it off. */
function assertPublishable(directory: string, manifest: { name: string; private?: unknown }): void {
  if (manifest.private !== true) return;
  throw new Error(
    `${directory}/package.json declares "private": true, so npm would skip it and still exit 0. ` +
      `${manifest.name} publishes from the SDK root, not from a workspace link.`,
  );
}

/** The registry is the only truth about what shipped: npm's exit code is not. Asks for the
 *  exact version and tolerates a little propagation lag, but nothing else. Deliberately
 *  the same identity check as `inspectPublishedPackage`. */
export async function confirmPublished(
  name: string,
  version: string,
  dependencies: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    attempts?: number;
  } = {},
): Promise<void> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const attempts = dependencies.attempts ?? 3;
  const url = `${REGISTRY_ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (response.ok) {
      const manifest = (await response.json()) as PackageManifest;
      if (manifest.name === name && manifest.version === version) return;
      throw new Error(`npm registry returned the wrong package identity for ${name}@${version}`);
    }
    if (response.status !== 404) {
      throw new Error(`npm registry check failed for ${name}@${version}: HTTP ${response.status}`);
    }
    if (attempt < attempts) await sleep(2000);
  }

  throw new Error(
    `npm reported success but ${name}@${version} is not on the registry. ` +
      `Nothing was published — check for a skipped private workspace manifest.`,
  );
}

/** npm versions are immutable, so an exact package identity is safe to skip locally. */
export async function inspectPublishedPackage(
  name: string,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishedPackageState> {
  const url = `${REGISTRY_ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (response.status === 404) return "missing";
  if (!response.ok) {
    throw new Error(`npm registry check failed for ${name}@${version}: HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as PackageManifest;
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`npm registry returned the wrong package identity for ${name}@${version}`);
  }
  return "verified";
}

export async function publishPackage(
  packageDir: string,
  dependencies: {
    fetchImpl?: typeof fetch;
    publish?: (directory: string) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<PublishedPackageState> {
  const directory = resolve(packageDir);
  const manifest = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
    private?: unknown;
  };
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`${directory}/package.json must declare name and version`);
  }
  assertPublishable(directory, { name: manifest.name, private: manifest.private });

  const state = await inspectPublishedPackage(
    manifest.name,
    manifest.version,
    dependencies.fetchImpl,
  );
  if (state === "verified") {
    process.stdout.write(
      `Verified ${manifest.name}@${manifest.version} already exists; skipping publish.\n`,
    );
    return state;
  }

  const publish = dependencies.publish ?? ((target: string) => {
    execFileSync("npm", ["publish", "--access", "public", target], {
      stdio: "inherit",
    });
  });
  publish(directory);
  await confirmPublished(manifest.name, manifest.version, {
    fetchImpl: dependencies.fetchImpl,
    sleep: dependencies.sleep,
  });
  return state;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packageDir = process.argv[2];
  if (!packageDir) throw new Error("usage: bun scripts/publish-package.ts <package-directory>");
  await publishPackage(packageDir);
}
