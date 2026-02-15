export function LoadingPage() {
  return (
    <div className="min-h-screen bg-light flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold text-brand-blue mb-6">WholesaleHub</h1>
      <div className="w-10 h-10 border-4 border-brand-teal border-t-transparent animate-spin rounded-full" />
      <p className="mt-4 text-dark/60 text-sm">Loading...</p>
    </div>
  );
}
