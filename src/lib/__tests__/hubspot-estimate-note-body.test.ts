import { describe, it, expect } from "vitest";

import { buildEstimateNoteBody } from "../hubspot-estimate-note-body";

describe("buildEstimateNoteBody", () => {
  it("新規（オンプレ）: 各ラベル行とライセンス数・オプション無・合計金額を出す", () => {
    const body = buildEstimateNoteBody({
      customerName: "テスト商事",
      agencyName: "サンプル代理店",
      deliveryType: "onprem",
      contractType: "new",
      amount: 1000000,
      maintenanceFee: 200000,
      formInputs: {
        licenseCount: 50,
        options: { hasOptions: false },
      },
    });

    expect(body.split("\n")).toEqual([
      "顧客名：テスト商事",
      "代理店：サンプル代理店",
      "提供形態：オンプレミス",
      "契約形態：新規",
      "ライセンス数：50",
      "オプション：無",
      "金額：¥1,200,000",
    ]);
  });

  it("オプション追加: 既存ライセンス数とオプション別ライセンス数を併記する", () => {
    const body = buildEstimateNoteBody({
      customerName: "顧客A",
      agencyName: "代理B",
      deliveryType: "onprem",
      contractType: "option_add",
      amount: 300000,
      maintenanceFee: 0,
      formInputs: {
        existingLicenseCount: 20,
        options: { hasOptions: true, iRepoScan: true, iRepoWorkFlow: true },
        optionLicenseCounts: { iRepoScan: 10, iRepoWorkFlow: 5 },
      },
    });

    expect(body).toContain("契約形態：オプション追加");
    expect(body).toContain("ライセンス数：既存 20");
    expect(body).toContain("オプション：i-Repo WorkFlow：5、i-Repo Scan：10");
    expect(body).toContain("金額：¥300,000");
  });

  it("ライセンス追加: 追加後と既存を併記する", () => {
    const body = buildEstimateNoteBody({
      customerName: "顧客C",
      agencyName: "代理D",
      deliveryType: "cloud",
      contractType: "license_add",
      amount: 500000,
      maintenanceFee: 50000,
      formInputs: {
        existingLicenseCount: 30,
        addedLicenseCount: 45,
      },
    });

    expect(body).toContain("提供形態：クラウド");
    expect(body).toContain("ライセンス数：追加後 45（既存 30）");
    expect(body).toContain("金額：¥550,000");
  });
});
