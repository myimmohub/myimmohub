import type { FilingAdapter } from "../adapter-types";
import { EST1A_V_ADAPTER } from "./est1a-v";

export const EST1A_V_FEWO_ADAPTER: FilingAdapter = {
  ...EST1A_V_ADAPTER,
  id: "est1a_v_fewo",
  map(input) {
    return {
      ...EST1A_V_ADAPTER.map(input),
      filingProfile: "est1a_v_fewo",
    };
  },
};
