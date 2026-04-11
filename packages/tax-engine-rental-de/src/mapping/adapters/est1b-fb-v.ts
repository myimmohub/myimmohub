import type { FilingAdapter } from "../adapter-types";
import { EST1A_V_ADAPTER } from "./est1a-v";

export const EST1B_FB_V_ADAPTER: FilingAdapter = {
  ...EST1A_V_ADAPTER,
  id: "est1b_fb_v",
  formPackId: "elster-assessment-2025",
  map(input) {
    return {
      filingProfile: "est1b_fb_v",
      formPackId: "elster-assessment-2025",
      fields: EST1A_V_ADAPTER.map(input).fields,
    };
  },
};
