"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/locale-context";

/** Sets document.documentElement.lang when locale changes */
export default function LocaleLangSync() {
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale === "ja" ? "ja" : "en";
  }, [locale]);
  return null;
}
