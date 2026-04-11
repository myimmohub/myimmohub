import type { FilingAdapter } from "../adapter-types";
import { EST1A_V_ADAPTER } from "./est1a-v";

export const EST1C_V_SONSTIGE_ADAPTER: FilingAdapter = {
  ...EST1A_V_ADAPTER,
  id: "est1c_v_sonstige",
  map(input) {
    return {
      ...EST1A_V_ADAPTER.map(input),
      filingProfile: "est1c_v_sonstige",
    };
  },
};
