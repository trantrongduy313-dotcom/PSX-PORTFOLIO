"use server";

import { cookies } from "next/headers";
import type { Locale } from "./labels";

export async function setLocaleAction(locale: Locale) {
  (await cookies()).set("psx-locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
