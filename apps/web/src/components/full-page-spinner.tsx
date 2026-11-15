import { Loader2Icon } from 'lucide-react';

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
      <Loader2Icon className="text-muted-foreground size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
