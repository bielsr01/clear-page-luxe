/**
 * Redimensiona uma imagem no cliente, mantendo proporção,
 * com reamostragem de alta qualidade. Útil para logos/avatares
 * que serão exibidos pequenos — evita arquivos enormes e melhora
 * a nitidez no destino final.
 */
export async function resizeImage(
  file: File,
  maxSize = 512,
  mime: "image/jpeg" | "image/png" | "image/webp" = "image/webp",
  quality = 0.92,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Falha ao carregar imagem"));
      i.src = url;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    // Se já é menor que o limite, mantém original
    if (Math.max(w, h) <= maxSize) return file;

    const scale = maxSize / Math.max(w, h);
    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Reamostragem em etapas (downscale gradual) — melhora muito a nitidez
    // em reduções grandes (>2x).
    let curW = w, curH = h;
    let src: CanvasImageSource = img;
    while (curW * 0.5 > targetW) {
      const nextW = Math.round(curW * 0.5);
      const nextH = Math.round(curH * 0.5);
      const tmp = document.createElement("canvas");
      tmp.width = nextW; tmp.height = nextH;
      const tctx = tmp.getContext("2d")!;
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(src, 0, 0, nextW, nextH);
      src = tmp;
      curW = nextW; curH = nextH;
    }
    ctx.drawImage(src, 0, 0, targetW, targetH);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))),
        mime,
        quality,
      );
    });

    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.${ext}`, { type: mime });
  } finally {
    URL.revokeObjectURL(url);
  }
}
