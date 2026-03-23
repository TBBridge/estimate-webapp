import { NextResponse } from "next/server";
import { getErrorChainMessage, isUniqueViolation } from "@/lib/pg-errors";

/** POST/PUT 代理店保存時の共通エラーレスポンス */
export function agencyMutationErrorResponse(e: unknown, logLabel: string): NextResponse {
  console.error(logLabel, e);
  const chain = getErrorChainMessage(e);
  if (/Database URL is not set|DATABASE_URL|POSTGRES_URL/i.test(chain)) {
    return NextResponse.json(
      {
        error:
          "データベースに接続できません。Vercel の環境変数に DATABASE_URL または POSTGRES_URL（Neon の接続文字列）を設定してください。",
      },
      { status: 503 }
    );
  }
  if (isUniqueViolation(e)) {
    return NextResponse.json({ error: "このログインメールは既に登録されています" }, { status: 409 });
  }
  const schemaHint = /column .* does not exist|relation .* does not exist/i.test(chain);
  const hint = schemaHint
    ? " DB のスキーマが古い可能性があります。Neon の SQL Editor で db-schema.sql の ALTER を実行してください。"
    : "";
  const detail = schemaHint ? "" : `（詳細: ${chain.slice(0, 180)}）`;
  return NextResponse.json(
    {
      error: `保存に失敗しました。${hint || "しばらくしてから再度お試しください。"}${detail}`,
    },
    { status: 500 }
  );
}
