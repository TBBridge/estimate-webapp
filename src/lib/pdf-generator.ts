/**
 * @react-pdf/renderer を使って Excel のセルデータから
 * 見積書 PDF を生成するユーティリティ
 *
 * フォント: Noto Sans JP（Google Fonts CDN から動的取得）
 */

import ReactPDF, { Document, Page, View, Text, Font, StyleSheet } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React from "react";

// ── フォント登録 ────────────────────────────────────────
const FONT_URL =
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

Font.register({
  family: "NotoSansJP",
  src: FONT_URL,
});

// ── スタイル定義 ────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 9,
    padding: "15mm 18mm",
    color: "#1a1a1a",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1a4a7a",
    letterSpacing: 4,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    borderBottom: "2px solid #1a4a7a",
    paddingBottom: 10,
  },
  metaBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  metaText: {
    fontSize: 8,
    color: "#555",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1a4a7a",
    backgroundColor: "#eef3fa",
    padding: "4 10",
    borderLeft: "4px solid #1a4a7a",
    marginTop: 14,
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #ccc",
    minHeight: 22,
  },
  thCell: {
    width: "35%",
    backgroundColor: "#f5f7fb",
    padding: "5 8",
    fontWeight: "bold",
    fontSize: 8,
    color: "#333",
    borderRight: "1px solid #ccc",
  },
  tdCell: {
    width: "65%",
    padding: "5 8",
    fontSize: 9,
    color: "#1a1a1a",
  },
  tableContainer: {
    borderTop: "1px solid #ccc",
    borderLeft: "1px solid #ccc",
    borderRight: "1px solid #ccc",
  },
  footer: {
    marginTop: 40,
    fontSize: 7,
    color: "#888",
    textAlign: "center",
    borderTop: "1px solid #ddd",
    paddingTop: 8,
  },
});

// ── 型定義 ─────────────────────────────────────────────
export interface ExcelCellData {
  /** セルアドレス ("A1","B2",...) → 値 のマップ */
  [cellAddr: string]: string | number | undefined;
}

export interface PdfGenerateParams {
  estimateNo: string;
  createdAt: string;
  agencyName: string;
  customerName: string;
  deliveryType: string;
  contractType: string;
  cloudBilling?: string;
  /** ExcelSheet から読み取った全セルデータ */
  cells: ExcelCellData;
  /** Excel の行数（描画する最大行） */
  maxRow: number;
  /** Excel の列数（描画する最大列） */
  maxCol: number;
}

const DELIVERY_LABEL: Record<string, string> = {
  onprem: "オンプレミス",
  subscription: "サブスクリプション",
  cloud: "クラウド",
};
const CONTRACT_LABEL: Record<string, string> = {
  new: "新規",
  license_add: "ライセンス追加",
  option_add: "オプション追加",
};

/** 列番号→列文字（0→A, 1→B, ...） */
function colLetter(c: number): string {
  let s = "";
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** セル値を文字列に */
function cellStr(cells: ExcelCellData, addr: string): string {
  const v = cells[addr];
  if (v === undefined || v === null) return "";
  return String(v);
}

/** Excel のデータ行をテーブル表示用に変換 */
function buildDataRows(
  cells: ExcelCellData,
  maxRow: number,
  maxCol: number
): { label: string; value: string }[] {
  const dataRows: { label: string; value: string }[] = [];
  for (let r = 1; r <= Math.min(maxRow, 60); r++) {
    const rowCells: string[] = [];
    for (let c = 0; c < Math.min(maxCol, 10); c++) {
      const addr = `${colLetter(c)}${r}`;
      const val = cellStr(cells, addr);
      if (val) rowCells.push(val);
    }
    if (rowCells.length > 0) {
      if (rowCells.length === 1) {
        dataRows.push({ label: rowCells[0], value: "" });
      } else {
        dataRows.push({ label: rowCells[0], value: rowCells.slice(1).join("  ") });
      }
    }
  }
  return dataRows;
}

/**
 * Document 要素を直接構築して返す（コンポーネントではなく createElement の結果）
 */
function createEstimateDocument(params: PdfGenerateParams) {
  const {
    estimateNo,
    createdAt,
    agencyName,
    customerName,
    deliveryType,
    contractType,
    cells,
    maxRow,
    maxCol,
  } = params;

  const dataRows = buildDataRows(cells, maxRow, maxCol);

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(Text, { style: styles.title }, "見 積 書"),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaText }, `見積番号: ${estimateNo}`),
          React.createElement(Text, { style: styles.metaText }, `作成日: ${createdAt}`),
          React.createElement(
            Text,
            { style: styles.metaText },
            `提供形態: ${DELIVERY_LABEL[deliveryType] ?? deliveryType}`
          ),
          React.createElement(
            Text,
            { style: styles.metaText },
            `契約形態: ${CONTRACT_LABEL[contractType] ?? contractType}`
          )
        )
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "基本情報"),
      React.createElement(
        View,
        { style: styles.tableContainer },
        React.createElement(
          View,
          { style: styles.tableRow },
          React.createElement(Text, { style: styles.thCell }, "代理店名"),
          React.createElement(Text, { style: styles.tdCell }, agencyName)
        ),
        React.createElement(
          View,
          { style: styles.tableRow },
          React.createElement(Text, { style: styles.thCell }, "顧客名"),
          React.createElement(Text, { style: styles.tdCell }, customerName)
        )
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "見積内容"),
      React.createElement(
        View,
        { style: styles.tableContainer },
        ...dataRows.map((row, i) =>
          React.createElement(
            View,
            { style: styles.tableRow, key: `row-${i}` },
            React.createElement(Text, { style: styles.thCell }, row.label),
            React.createElement(Text, { style: styles.tdCell }, row.value)
          )
        )
      ),
      React.createElement(
        Text,
        { style: styles.footer },
        `本見積書は ${createdAt} に作成されました。有効期限は作成日より30日間です。`
      )
    )
  );
}

/**
 * PDF を Buffer として生成する
 */
export async function generateEstimatePdf(
  params: PdfGenerateParams
): Promise<Buffer> {
  const doc = createEstimateDocument(params);
  const stream = await ReactPDF.renderToStream(
    doc as unknown as React.ReactElement<DocumentProps>
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
