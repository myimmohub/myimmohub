import { REQUIRED_FIXTURES } from "../fixtures/manifest";

export const UNIT_CASES = REQUIRED_FIXTURES.map((name) => ({
  name,
  expectation: "fixture_exists",
}));
