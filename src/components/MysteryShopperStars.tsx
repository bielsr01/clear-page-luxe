import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn(
            "p-0.5 transition-transform",
            !readOnly && "hover:scale-110 cursor-pointer",
            readOnly && "cursor-default"
          )}
          aria-label={`${n} estrelas`}
        >
          <Star
            className={cn("w-7 h-7", n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")}
          />
        </button>
      ))}
    </div>
  );
}
