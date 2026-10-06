import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

type PricedProduct = { price: number | string; original_price?: number | string | null };

/** Em promoção quando o preço "de" (`original_price`) é maior que o valor cobrado (`price`). */
export function hasDiscount(p: PricedProduct) {
  return p.original_price != null && Number(p.original_price) > Number(p.price);
}

/**
 * Preço do produto. Em promoção: preço "de" cinza e riscado + preço com desconto em verde.
 * `priceClassName` estiliza o valor cobrado (peso, tamanho, cor sem desconto).
 */
export function ProductPrice({ product, className, priceClassName }: { product: PricedProduct; className?: string; priceClassName?: string }) {
  if (!hasDiscount(product)) {
    return <div className={cn(className, priceClassName)}>{brl(Number(product.price))}</div>;
  }
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="text-[0.85em] font-normal text-muted-foreground line-through">{brl(Number(product.original_price))}</span>
      <span className={cn(priceClassName, "text-success")}>{brl(Number(product.price))}</span>
    </div>
  );
}
