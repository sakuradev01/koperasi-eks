import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dockerfilePath = fileURLToPath(new URL("../Dockerfile", import.meta.url));

test("frontend image copies nginx config from the monorepo root context", () => {
  const dockerfile = readFileSync(dockerfilePath, "utf8");

  assert.match(
    dockerfile,
    /^COPY client\/nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf$/m,
  );
  assert.doesNotMatch(
    dockerfile,
    /^COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf$/m,
  );
});
