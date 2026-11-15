import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

export function Cover({
  title,
  coverUrl,
  className = '',
}: {
  title: string;
  coverUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [coverUrl]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-stone-600 via-stone-800 to-stone-950 ${className}`}
    >
      {coverUrl && !failed ? (
        <img
          src={coverUrl}
          alt={`Cover of ${title}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between p-3 text-amber-100">
          <BookOpen className="h-4 w-4 opacity-70" />
          <span className="font-display text-xs leading-snug line-clamp-4">{title}</span>
        </div>
      )}
    </div>
  );
}
