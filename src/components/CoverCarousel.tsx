import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

type Props = {
  images: string[];
  alt: string;
  intervalMs?: number;
};

/**
 * Carrossel de fotos de capa.
 * - Auto-avança a cada `intervalMs` (default 4000ms) quando houver mais de uma foto.
 * - Suporta arrastar/clicar para trocar (embla).
 * - Mostra bolinhas com a foto atual.
 */
export function CoverCarousel({ images, alt, intervalMs = 4000 }: Props) {
  const list = (images || []).filter(Boolean);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSel = () => setSelected(emblaApi.selectedScrollSnap());
    onSel();
    emblaApi.on("select", onSel);
    emblaApi.on("reInit", onSel);
    return () => {
      emblaApi.off("select", onSel);
      emblaApi.off("reInit", onSel);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || list.length <= 1) return;
    const id = window.setInterval(() => {
      emblaApi.scrollNext();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [emblaApi, list.length, intervalMs]);

  if (list.length === 0) return null;

  return (
    <div className="absolute inset-0">
      <div className="overflow-hidden h-full" ref={emblaRef}>
        <div className="flex h-full">
          {list.map((src, i) => (
            <div key={i} className="relative flex-[0_0_100%] h-full">
              <img
                src={src}
                alt={`${alt} ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-center select-none"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
      {list.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para foto ${i + 1}`}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all ${i === selected ? "w-5 bg-white" : "w-2 bg-white/60"} ring-1 ring-black/20`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
