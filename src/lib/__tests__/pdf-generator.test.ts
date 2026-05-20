import { describe, it, expect } from "vitest";

import {
  extractAmountsFromCsv,
  extractAmountsFromPdfText,
} from "@/lib/pdf-generator";

describe("extractAmountsFromCsv", () => {
  // LibreOffice の CSV 出力はセル書式を剥がすため、表示の千区切りカンマは入らない。
  it("picks the largest number on the matching keyword line", () => {
    const csv = [
      "ヘッダ,項目,金額",
      "御見積金額,,1234567",
      "保守料,,234000",
      "備考,1,2",
    ].join("\n");

    expect(extractAmountsFromCsv(csv)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
    });
  });

  it("falls back to 合計 line when 見積金額 keyword is absent", () => {
    const csv = ["合計,,500000", "保守,,80000"].join("\n");
    expect(extractAmountsFromCsv(csv)).toEqual({
      amount: 500000,
      maintenanceFee: 80000,
    });
  });

  it("returns zeros for empty input", () => {
    expect(extractAmountsFromCsv("")).toEqual({ amount: 0, maintenanceFee: 0 });
  });
});

describe("extractAmountsFromPdfText", () => {
  it("extracts amount and maintenance from PDF-style text (no comma cell separators)", () => {
    // Gotenberg / LibreOffice の PDF テキスト抽出例（行内が空白区切り）
    const text = [
      "見積書",
      "御見積金額    ¥1,234,567",
      "年額保守    234,000",
      "ご担当: 山田 03-1234-5678",
    ].join("\n");

    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 1234567,
      maintenanceFee: 234000,
    });
  });

  it("picks 合計 when 見積金額 line is missing", () => {
    const text = ["小計 100,000", "合計 500,000", "保守 80,000"].join("\n");
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 500000,
      maintenanceFee: 80000,
    });
  });

  it("ignores non-keyword lines and returns zeros", () => {
    const text = "請求先 株式会社サンプル 03-9999-0000";
    expect(extractAmountsFromPdfText(text)).toEqual({
      amount: 0,
      maintenanceFee: 0,
    });
  });
});
