"use client";

import { useLocale } from "@/lib/locale-context";
import { t } from "@/lib/translations";
import { getDashboardStats } from "@/lib/mock-data";
import {
  BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";

const BRAND = "#0d6b5c";
const COLORS = ["#0d6b5c", "#34a88a", "#71c9b3", "#a8dfd3", "#d4f0ea"];

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-5 shadow-sm dark:border-stone-700/80">
      <p className="font-body text-xs text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("ja-JP");
}

export default function AdminDashboardPage() {
  const { locale } = useLocale();
  const stats = getDashboardStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--color-ink)]">
          {t(locale, "admin.dashboardTitle")}
        </h1>
        <p className="mt-1 font-body text-sm text-[var(--color-ink-muted)]">
          {t(locale, "admin.dashboardDescription")}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label={t(locale, "admin.kpi.total")} value={`${stats.total} 件`} />
        <KpiCard label={t(locale, "admin.kpi.approved")} value={`${stats.approved} 件`} />
        <KpiCard label={t(locale, "admin.kpi.pending")} value={`${stats.pending} 件`} />
        <KpiCard label={t(locale, "admin.kpi.totalAmount")} value={`¥${fmt(stats.totalAmount)}`} />
      </div>

      {/* 代理店別棒グラフ */}
      <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-5 shadow-sm dark:border-stone-700/80">
        <h2 className="mb-4 font-body text-sm font-medium text-[var(--color-ink)]">
          {t(locale, "admin.chart.byAgency")}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.byAgency} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`${v} 件`, t(locale, "admin.chart.count")]} />
            <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 月次推移折れ線 */}
      <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-5 shadow-sm dark:border-stone-700/80">
        <h2 className="mb-4 font-body text-sm font-medium text-[var(--color-ink)]">
          {t(locale, "admin.chart.monthly")}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={stats.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`} />
            <Tooltip
              formatter={(v, name) =>
                name === t(locale, "admin.chart.count") ? [`${v} 件`, name] : [`¥${fmt(Number(v))}`, name]
              }
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="count" name={t(locale, "admin.chart.count")} stroke={BRAND} strokeWidth={2} dot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="amount" name={t(locale, "admin.chart.amount")} stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 提供形態 & 契約形態 ドーナツ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-5 shadow-sm dark:border-stone-700/80">
          <h2 className="mb-4 font-body text-sm font-medium text-[var(--color-ink)]">
            {t(locale, "admin.chart.byDelivery")}
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats.byDelivery} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                {stats.byDelivery.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} 件`]} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-stone-200/80 bg-[var(--color-surface-elevated)] p-5 shadow-sm dark:border-stone-700/80">
          <h2 className="mb-4 font-body text-sm font-medium text-[var(--color-ink)]">
            {t(locale, "admin.chart.byContract")}
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={stats.byContract} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                {stats.byContract.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} 件`]} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
