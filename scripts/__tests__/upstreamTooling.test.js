import { afterEach, describe, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;

function jsonResponse(value) {
  return {
    ok: true,
    json: async () => value
  };
}

function textResponse(value) {
  return {
    ok: true,
    text: async () => value
  };
}

afterEach(() => {
  vi.restoreAllMocks();

  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    Reflect.deleteProperty(globalThis, "fetch");
  }
});

describe("upstream tooling", () => {
  test("explicit refs bypass default-branch discovery", async () => {
    const { resolveUpstreamRef } = await import("../upstream/shared.mjs");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(resolveUpstreamRef("release-branch")).resolves.toBe(
      "release-branch"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("missing refs resolve through the upstream repo default branch", async () => {
    const { resolveUpstreamRef, UPSTREAM_API_BASE } =
      await import("../upstream/shared.mjs");
    const fetchMock = vi.fn(async (url) => {
      if (url === UPSTREAM_API_BASE) {
        return jsonResponse({ default_branch: "master" });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    await expect(resolveUpstreamRef(undefined)).resolves.toBe("master");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      UPSTREAM_API_BASE,
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "ranty-js-upstream-sync"
        })
      })
    );
  });

  test("remote bundle loading uses the resolved default branch", async () => {
    const { loadUpstreamBundle, UPSTREAM_API_BASE, UPSTREAM_RAW_BASE } =
      await import("../upstream/shared.mjs");
    const fetchMock = vi.fn(async (url) => {
      if (url === UPSTREAM_API_BASE) {
        return jsonResponse({ default_branch: "master" });
      }

      if (`${url}` === `${UPSTREAM_API_BASE}/commits/master`) {
        return jsonResponse({ sha: "abc123" });
      }

      if (`${url}` === `${UPSTREAM_API_BASE}/git/trees/abc123?recursive=1`) {
        return jsonResponse({
          tree: [
            {
              type: "blob",
              path: "parity/ranty-js/contract.json"
            }
          ]
        });
      }

      if (
        `${url}` === `${UPSTREAM_RAW_BASE}/abc123/parity/ranty-js/contract.json`
      ) {
        return textResponse('{"source_commit":"abc123"}');
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    const bundle = await loadUpstreamBundle({});
    expect(bundle.requestedRef).toBe("master");
    expect(bundle.sourceCommit).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledWith(
      `${UPSTREAM_API_BASE}/commits/master`,
      expect.any(Object)
    );
  });
});
