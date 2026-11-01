/** Shared browser SVG decoding; each task owns and releases its image and object URL on every exit. */
export async function withSvgImage(svg: string, consume: (image: HTMLImageElement) => void, wait: (decode: Promise<void>) => Promise<void>): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  let image: HTMLImageElement | undefined;
  try {
    image = new Image();
    image.src = url;
    await wait(image.decode());
    consume(image);
  } finally {
    if (image) image.src = "";
    URL.revokeObjectURL(url);
  }
}
