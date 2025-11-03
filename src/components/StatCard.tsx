// 7-1 StatCard — gradient border + hover
export default function StatCard({ title, value, desc }: { title: string; value: string; desc?: string }) {
  return (
    <div className="relative card-gradient-border rounded-2xl bg-white p-5 shadow-card hover:shadow-soft transition">
      <div className="text-slate-500 text-sm">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {desc && <div className="text-slate-400 text-xs mt-1">{desc}</div>}
    </div>
  );
}
