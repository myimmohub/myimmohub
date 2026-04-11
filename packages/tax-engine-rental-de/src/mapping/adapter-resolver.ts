import type { FilingProfile } from "../domain/types";
import type { FilingAdapter } from "./adapter-types";
import { EST1A_V_ADAPTER, EST1A_V_FEWO_ADAPTER, EST1A_V_SONSTIGE_ADAPTER, EST1B_FB_V_ADAPTER, EST1B_FB_V_FEWO_ADAPTER, EST1C_V_ADAPTER, EST1C_V_FEWO_ADAPTER, EST1C_V_SONSTIGE_ADAPTER, FW_SIDE_ADAPTER } from "./adapters/index";

const ADAPTERS: FilingAdapter[] = [
  EST1A_V_ADAPTER,
  EST1A_V_FEWO_ADAPTER,
  EST1A_V_SONSTIGE_ADAPTER,
  EST1B_FB_V_ADAPTER,
  EST1B_FB_V_FEWO_ADAPTER,
  EST1C_V_ADAPTER,
  EST1C_V_FEWO_ADAPTER,
  EST1C_V_SONSTIGE_ADAPTER,
  FW_SIDE_ADAPTER,
];

export function resolveAdapter(filingProfile: FilingProfile, formPackId?: string) {
  return ADAPTERS.find((adapter) => adapter.id === filingProfile && (!formPackId || adapter.formPackId === formPackId))
    ?? ADAPTERS.find((adapter) => adapter.id === filingProfile);
}
