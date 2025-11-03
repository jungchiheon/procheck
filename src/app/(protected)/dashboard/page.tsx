'use client';
import ClientGuard from '@/middleware/client-guard';
import PageWrap from '@/components/PageWrap';
import StatCard from '@/components/StatCard';
import { useAuth } from '@/lib/auth';
import { LS_KEYS, load } from '@/lib/storage';

export default function Dashboard() {
  const { user } = useAuth();
  const attendance = load<any[]>(LS_KEYS.attendance) || [];
  const sales = load<any[]>(LS_KEYS.sales) || [];
  const calls = load<any[]>(LS_KEYS.calls) || [];

  const myAttendance = attendance.filter(a => a.userId === user?.id);
  const mySales = sales.filter(s => s.userId === user?.id);

  const totalHours = myAttendance.reduce((sum,a)=> sum + (a.totalHours||0),0);
  const totalSales = mySales.reduce((sum,s)=> sum + (s.sales||0),0);
  const totalCnt = mySales.reduce((sum,s)=> sum + (s.count||0),0);

  const pending = calls.filter(c=>c.status==='pending').slice(0,5);

  return (
    <ClientGuard>
      <PageWrap>
        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="총 근무시간" value={`${totalHours.toFixed(1)} h`} desc="내 출퇴근 누적" />
          <StatCard title="내 매출" value={`${totalSales.toLocaleString()} 원`} desc="누적 합계" />
          <StatCard title="내 건수" value={`${totalCnt} 건`} desc="누적 합계" />
          <StatCard title="대기중 호출" value={`${calls.filter(c=>c.status==='pending').length} 건`} desc="관리자 확인 필요" />
        </div>

        {/* Lower split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {/* Attendance table */}
          <div className="card p-4 lg:col-span-2">
            <div className="text-lg font-semibold mb-3">최근 출퇴근</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-left">출근</th>
                    <th className="p-3 text-left">퇴근</th>
                    <th className="p-3 text-left">총 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {myAttendance.slice(0,10).map((r:any)=> (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{new Date(r.checkIn).toLocaleString()}</td>
                      <td className="p-3">{r.checkOut? new Date(r.checkOut).toLocaleString(): '-'}</td>
                      <td className="p-3">{(r.totalHours||0).toFixed(2)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Calls status */}
          <div className="card p-4">
            <div className="text-lg font-semibold mb-1">호출 현황</div>
            <div className="text-slate-500 text-sm mb-3">승인 대기 (최근 5개)</div>
            <ul className="space-y-2">
              {pending.length === 0 && <li className="text-slate-500 text-sm">대기중 호출이 없습니다.</li>}
              {pending.map((c:any)=> (
                <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                  <div className="text-sm">
                    <div className="font-medium">요청시간: {new Date(c.when).toLocaleString()}</div>
                    <div className="text-slate-500 text-xs">요청자 ID: {c.staffId}</div>
                  </div>
                  <div className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">대기</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageWrap>
    </ClientGuard>
  );
}
