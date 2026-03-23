/** 国際電話の国番号（プルダウン用） */
export type DialCodeOption = { value: string; labelJa: string; labelEn: string };

export const COUNTRY_DIAL_CODES: DialCodeOption[] = [
  { value: "+81", labelJa: "日本 (+81)", labelEn: "Japan (+81)" },
  { value: "+886", labelJa: "台湾 (+886)", labelEn: "Taiwan (+886)" },
  { value: "+86", labelJa: "中国 (+86)", labelEn: "China (+86)" },
  { value: "+82", labelJa: "韓国 (+82)", labelEn: "South Korea (+82)" },
  { value: "+1", labelJa: "米国・カナダ (+1)", labelEn: "US / Canada (+1)" },
  { value: "+44", labelJa: "英国 (+44)", labelEn: "UK (+44)" },
  { value: "+49", labelJa: "ドイツ (+49)", labelEn: "Germany (+49)" },
  { value: "+33", labelJa: "フランス (+33)", labelEn: "France (+33)" },
  { value: "+61", labelJa: "オーストラリア (+61)", labelEn: "Australia (+61)" },
  { value: "+65", labelJa: "シンガポール (+65)", labelEn: "Singapore (+65)" },
  { value: "+60", labelJa: "マレーシア (+60)", labelEn: "Malaysia (+60)" },
  { value: "+66", labelJa: "タイ (+66)", labelEn: "Thailand (+66)" },
  { value: "+84", labelJa: "ベトナム (+84)", labelEn: "Vietnam (+84)" },
  { value: "+63", labelJa: "フィリピン (+63)", labelEn: "Philippines (+63)" },
  { value: "+62", labelJa: "インドネシア (+62)", labelEn: "Indonesia (+62)" },
  { value: "+91", labelJa: "インド (+91)", labelEn: "India (+91)" },
  { value: "+852", labelJa: "香港 (+852)", labelEn: "Hong Kong (+852)" },
  { value: "+853", labelJa: "マカオ (+853)", labelEn: "Macau (+853)" },
];

export const DEFAULT_DIAL_CODE = "+81";
