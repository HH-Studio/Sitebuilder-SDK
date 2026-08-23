import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { confirmPublished, inspectPublishedPackage, publishPackage } from "../scripts/publish-package";

const name = "@snabbsajt/site-kit";
const version = "0.4.0";
function response(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function packageDir(extra: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "snabbsajt-publish-"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version, ...extra }));
  return directory;
}

/** 404 until the local publish lands. */
function absentThenPublishedFetch() {
  let published = false;
  return {
    fetchImpl: vi.fn(async () =>
      published ? response(200, { name, version }) : response(404)) as unknown as typeof fetch,
    land: () => {
      published = true;
    },
  };
}

const noSleep = async () => {};

describe("retry-safe package publishing", () => {
  it("publishes only when the exact version is absent", async () => {
    const registry = absentThenPublishedFetch();
    const publish = vi.fn(registry.land);
    const state = await publishPackage(packageDir(), {
      fetchImpl: registry.fetchImpl,
      publish,
      sleep: noSleep,
    });

    expect(state).toBe("missing");
    expect(publish).toHaveBeenCalledOnce();
  });

  it("refuses the private workspace manifest npm would silently skip", async () => {
    const publish = vi.fn();
    await expect(publishPackage(packageDir({ private: true }), {
      fetchImpl: vi.fn(async () => response(404)) as unknown as typeof fetch,
      publish,
      sleep: noSleep,
    })).rejects.toThrow(/private.*publishes from the SDK root/s);
    expect(publish).not.toHaveBeenCalled();
  });

  it("fails when npm exits 0 but the registry never received the version", async () => {
    const publish = vi.fn();
    await expect(publishPackage(packageDir(), {
      fetchImpl: vi.fn(async () => response(404)) as unknown as typeof fetch,
      publish,
      sleep: noSleep,
    })).rejects.toThrow(/npm reported success but .* is not on the registry/);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("tolerates registry propagation lag before giving up", async () => {
    const registry = absentThenPublishedFetch();
    const sleep = vi.fn(async () => registry.land());
    await expect(confirmPublished(name, version, {
      fetchImpl: registry.fetchImpl,
      sleep,
    })).resolves.toBeUndefined();
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("skips an exact version that already exists", async () => {
    const publish = vi.fn();
    const state = await publishPackage(packageDir(), {
      fetchImpl: vi.fn(async () => response(200, { name, version })) as unknown as typeof fetch,
      publish,
    });

    expect(state).toBe("verified");
    expect(publish).not.toHaveBeenCalled();
  });

  it("fails closed on registry errors and identity mismatches", async () => {
    await expect(inspectPublishedPackage(
      name,
      version,
      vi.fn(async () => response(503)) as unknown as typeof fetch,
    )).rejects.toThrow(/HTTP 503/);
    await expect(inspectPublishedPackage(
      name,
      version,
      vi.fn(async () => response(200, { name, version: "9.9.9" })) as unknown as typeof fetch,
    )).rejects.toThrow(/wrong package identity/);
  });

});
