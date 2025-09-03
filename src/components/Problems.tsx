export default function Problems() {
  return (
    <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm">
      <h2 className="text-2xl font-semibold tracking-tight">Problems we solved</h2>
      <ul className="mt-4 space-y-3 text-gray-700">
        <li className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
          Urgent same-day prints for events
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
          Logo color matching that looks clean
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-500" />
          Size runs for teams without stockouts
        </li>
      </ul>
    </div>
  );
}
