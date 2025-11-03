export default function PageWrap({ children }: { children?: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">{children}</div>
    </div>
  );
}