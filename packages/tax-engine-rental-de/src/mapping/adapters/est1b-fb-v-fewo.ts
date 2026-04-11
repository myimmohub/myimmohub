import type { FilingAdapter } from "../adapter-types";
import { EST1B_FB_V_ADAPTER } from "./est1b-fb-v";

export const EST1B_FB_V_FEWO_ADAPTER: FilingAdapter = {
  ...EST1B_FB_V_ADAPTER,
  id: "est1b_fb_v_fewo",
  map(input) {
    return {
      ...EST1B_FB_V_ADAPTER.map(input),
      filingProfile: "est1b_fb_v_fewo",
    };
  },
};
