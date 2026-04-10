"use client";

import { createContext, useContext } from "react";

export const PropertyContext = createContext<string>("");

export function usePropertyId() {
  return useContext(PropertyContext);
}
