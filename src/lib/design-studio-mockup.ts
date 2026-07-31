export type DesignSide = "front" | "back";

export type ArtworkPlacement = {
  enabled: boolean;
  x: number;
  y: number;
  scale: number;
  rotate: number;
};

export type ArtworkCopy = ArtworkPlacement & { id: number };

export type TextPlacement = {
  enabled: boolean;
  value: string;
  color: string;
  size: number;
  rotate: number;
  x: number;
  y: number;
  font: string;
};

export type TextCopy = TextPlacement & { id: number };

export type DesignSideLayout = {
  artwork: ArtworkPlacement;
  artworkCopies: ArtworkCopy[];
  text: TextPlacement;
  textCopies: TextCopy[];
};

type PrintZone = { left: number; top: number; width: number; height: number };

type RenderMockupInput = {
  side: DesignSide;
  productLabel: string;
  color: string;
  garmentImageUrl: string;
  printZone: PrintZone;
  design: DesignSideLayout;
  artworkFile: File | null;
};

const MOCKUP_WIDTH = 1200;
const MOCKUP_HEIGHT = 1500;
const STUDIO_REFERENCE_WIDTH = 550;

function getRenderableArtworkLayers(design: DesignSideLayout) {
  return [design.artwork, ...design.artworkCopies].filter((layer) => layer.enabled);
}

function getRenderableTextLayers(design: DesignSideLayout) {
  return [design.text, ...design.textCopies].filter(
    (layer) => layer.enabled && layer.value.trim()
  );
}

export function sideHasVisibleDesign(design: DesignSideLayout, artworkFile: File | null) {
  return Boolean(
    (artworkFile && getRenderableArtworkLayers(design).length) ||
      getRenderableTextLayers(design).length
  );
}

function getImageFetchUrl(source: string) {
  if (!/^https?:\/\//i.test(source)) return source;
  const params = new URLSearchParams({ url: source, name: "garment-mockup-source" });
  return `/api/shops/download?${params.toString()}`;
}

async function loadCanvasImage(source: string | Blob) {
  const blob =
    typeof source === "string"
      ? await fetch(getImageFetchUrl(source), { cache: "force-cache" }).then((response) => {
          if (!response.ok) throw new Error("Could not load the garment image for the final mockup.");
          return response.blob();
        })
      : source;
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not prepare an image for the final mockup."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  context.drawImage(
    image,
    left + (width - renderedWidth) / 2,
    top + (height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight
  );
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create the final mockup image."));
    }, "image/png");
  });
}

function safeFilenamePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "design"
  );
}

export async function renderDesignStudioMockup({
  side,
  productLabel,
  color,
  garmentImageUrl,
  printZone,
  design,
  artworkFile,
}: RenderMockupInput) {
  const [garmentImage, artworkImage] = await Promise.all([
    loadCanvasImage(garmentImageUrl),
    artworkFile && getRenderableArtworkLayers(design).length
      ? loadCanvasImage(artworkFile)
      : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = MOCKUP_WIDTH;
  canvas.height = MOCKUP_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the final mockup.");

  const background = context.createRadialGradient(
    MOCKUP_WIDTH / 2,
    120,
    10,
    MOCKUP_WIDTH / 2,
    300,
    MOCKUP_HEIGHT
  );
  background.addColorStop(0, "#ffffff");
  background.addColorStop(0.58, "#f5f3ed");
  background.addColorStop(1, "#eeece5");
  context.fillStyle = background;
  context.fillRect(0, 0, MOCKUP_WIDTH, MOCKUP_HEIGHT);

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.22)";
  context.shadowBlur = 50;
  context.shadowOffsetY = 28;
  drawContainedImage(context, garmentImage, 0, 0, MOCKUP_WIDTH, MOCKUP_HEIGHT);
  context.restore();

  const zone = {
    left: (printZone.left / 100) * MOCKUP_WIDTH,
    top: (printZone.top / 100) * MOCKUP_HEIGHT,
    width: (printZone.width / 100) * MOCKUP_WIDTH,
    height: (printZone.height / 100) * MOCKUP_HEIGHT,
  };

  for (const text of getRenderableTextLayers(design)) {
    const centerX = zone.left + ((50 + text.x) / 100) * zone.width;
    const centerY = zone.top + ((50 + text.y) / 100) * zone.height;
    context.save();
    context.translate(centerX, centerY);
    context.rotate((text.rotate * Math.PI) / 180);
    context.fillStyle = text.color;
    context.font = `800 ${text.size * (MOCKUP_WIDTH / STUDIO_REFERENCE_WIDTH)}px ${text.font}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(0, 0, 0, 0.24)";
    context.shadowBlur = 17;
    context.shadowOffsetY = 4;
    context.fillText(text.value, 0, 0);
    context.restore();
  }

  if (artworkImage) {
    for (const artwork of getRenderableArtworkLayers(design)) {
      const centerX = zone.left + ((50 + artwork.x) / 100) * zone.width;
      const centerY = zone.top + ((50 + artwork.y) / 100) * zone.height;
      const artworkSize = (artwork.scale / 100) * zone.width;
      context.save();
      context.translate(centerX, centerY);
      context.rotate((artwork.rotate * Math.PI) / 180);
      drawContainedImage(
        context,
        artworkImage,
        -artworkSize / 2,
        -artworkSize / 2,
        artworkSize,
        artworkSize
      );
      context.restore();
    }
  }

  const blob = await canvasToPng(canvas);
  const filename = `${safeFilenamePart(productLabel)}-${safeFilenamePart(color)}-${side}-final-mockup.png`;
  return new File([blob], filename, { type: "image/png", lastModified: Date.now() });
}
