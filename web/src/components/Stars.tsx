import { Star } from 'lucide-react';

export function Stars({ rating, count }: { rating: number; count?: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          className={`h-3.5 w-3.5 ${
            position <= rounded
              ? 'fill-amber-500 text-amber-500'
              : 'fill-none text-stone-300'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-stone-500">
        {rating.toFixed(1)}
        {count !== undefined ? ` (${count})` : ''}
      </span>
    </span>
  );
}
