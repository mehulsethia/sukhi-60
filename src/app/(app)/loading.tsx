// Shown instantly while a screen loads from the server, so a tap always gets feedback.
export default function Loading() {
  const bar = "rounded-lg bg-surface-3 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-3">
        <div className={`${bar} h-4 w-40`} />
        <div className={`${bar} h-9 w-3/4 max-w-md`} />
        <div className={`${bar} h-5 w-1/2 max-w-xs`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel flex flex-col gap-3 p-5">
              <div className={`${bar} h-5 w-1/3`} />
              <div className={`${bar} h-4 w-2/3`} />
              <div className={`${bar} h-10 w-full`} />
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          {[0, 1].map((i) => <div key={i} className={`${bar} h-40 w-full`} />)}
        </div>
      </div>
    </div>
  );
}
