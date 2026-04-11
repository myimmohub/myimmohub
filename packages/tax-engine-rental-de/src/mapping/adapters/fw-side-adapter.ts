import type { FilingAdapter } from "../adapter-types";
import { EST1A_V_ADAPTER } from "./est1a-v";

export const FW_SIDE_ADAPTER: FilingAdapter = {
  ...EST1A_V_ADAPTER,
  id: "fw_optional_side_adapter",
  map(input) {
    return {
      ...EST1A_V_ADAPTER.map(input),
      filingProfile: "fw_optional_side_adapter",
    };
  },
};
