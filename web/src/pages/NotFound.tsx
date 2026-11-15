import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-20 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-stone-100 text-stone-400">
        <Compass className="h-6 w-6" />
      </span>
      <p className="font-display text-3xl text-stone-900">Off the shelf</p>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        This page is not in the catalogue. Check the address, or head back to the stacks.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
      >
        Back to catalogue
      </Link>
    </div>
  );
}
