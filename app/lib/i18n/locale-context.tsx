"use client";

import { createContext, useContext } from "react";
import { LABELS, type Locale, type Labels } from "./labels";

const LocaleContext = createContext<Locale>("vi");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Returns the full label map for the current locale. Default: "vi". */
export function useLabels(): Labels {
  return LABELS[useContext(LocaleContext)];
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
