'use client';
// Rankings v2 — 기간 필터(일/주/월) + 그래프(recharts)
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import { LS_KEYS, load } from '@/lib/storage';
import React from 'react';
import { subDays, startOfDay, startOfMonth, isAfter } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

type Period = '7d' | '30d' | 'month';

export default function RankingsPage() {
  const users = load<any[]>(LS_KEYS.users) || [];
  const sales = (load<any[]>(LS_KEYS.sales) || []).map(s => ({ ...s, date: new Date(s.date || s.when || Date.now()) }));

  const [period, setPeriod] = React.useState<Period>('30d');

  const rangeStart = React.useMemo(() => {
    const now = new Date();
    if (period === '7d') return startOfDay(subDays(now, 6));
    if (period === '30d') return startOfDay(subDays(now, 29));
    return startOfMonth(now);
  }, [period]);

  const filtered = sales.filter(s => isAfter(s.date, rangeStart) || +s.date === +rangeStart);

  const perUser = users.map(u => {
    const mine = filtered.filter(s => s.userId === u.id);
    const revenue = mine.reduce((sum,s)=> sum + (s.sales||0),0);
    const count = mine.reduce((sum,s)=> sum + (s.count||0),0);
    const score = revenue*0.7 + count*0.3;
    return { user: u, revenue, count, score };
  }).sort((a,b)=> b.score - a.score);

  const byDateMap = new Map<string, { date: string; revenue: number; count: number }>();
  filtered.forEach(s => {
    const key = startOfDay(new Date(s.date)).toISOString().slice(0,10);
    const prev = byDateMap.get(key) || { date: key, revenue: 0, count: 0 };
    prev.revenue += s.sales || 0;
    prev.count += s.count || 0;
    byDateMap.set(key, prev);
  });
  const byDate = Array.from(byDateMap.values()).sort((a,b)=> a.date.localeCompare(b.date));

  return (
    <ClientGuard>
      <PageWrap>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">랭킹</h2>
          <div className="flex items-center gap-2 text-sm">
            <button onClick={()=>setPeriod('7d')}
              className={`px-3 py-1.5 rounded-xl border ${period==='7d'?'bg-slate-900 text-white border-slate-900':'border-slate-300 hover:bg-slate-100'}`}>
              최근 7일
            </button>
            <button onClick={()=>setPeriod('30d')}
              className={`px-3 py-1.5 rounded-xl border ${period==='30d'?'bg-slate-900 text-white border-slate-900':'border-slate-300 hover:bg-slate-100'}`}>
              최근 30일
            </button>
            <button onClick={()=>setPeriod('month')}
              className={`px-3 py-1.5 rounded-xl border ${period==='month'?'bg-slate-900 text-white border-slate-900':'border-slate-300 hover:bg-slate-100'}`}>
              이번 달
            </button>
          </div>
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">순위</th>
                <th className="p-3 text-left">직원</th>
                <th className="p-3 text-left">매출</th>
                <th className="p-3 text-left">건수</th>
                <th className="p-3 text-left">점수</th>
              </tr>
            </thead>
            <tbody>
              {perUser.map((r,idx)=> (
                <tr key={r.user.id} className="border-t">
                  <td className="p-3">{idx+1}</td>
                  <td className="p-3">{r.user.nickname||r.user.username}</td>
                  <td className="p-3">{r.revenue.toLocaleString()} 원</td>
                  <td className="p-3">{r.count} 건</td>
                  <td className="p-3">{Math.round(r.score).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-sm font-medium mb-2">일자별 매출 추이</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="매출" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-sm font-medium mb-2">일자별 건수 추이</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="건수" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </PageWrap>
    </ClientGuard>
  );
}
