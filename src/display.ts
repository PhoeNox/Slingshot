export const PLAYING_AREA_WIDTH = 800;
export const PLAYING_AREA_HEIGHT = 600;

export interface CanvasFit {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
}

export function fitPlayingArea(availableWidth: number, availableHeight: number, devicePixelRatio: number): CanvasFit {
  const cssScale = Math.min(availableWidth / PLAYING_AREA_WIDTH, availableHeight / PLAYING_AREA_HEIGHT);
  const cssWidth = Math.floor(PLAYING_AREA_WIDTH * cssScale);
  const cssHeight = Math.floor(PLAYING_AREA_HEIGHT * cssScale);
  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.round(cssWidth * devicePixelRatio),
    backingHeight: Math.round(cssHeight * devicePixelRatio),
  };
}

export function applyFit(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, fit: CanvasFit): void {
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  canvas.width = fit.backingWidth;
  canvas.height = fit.backingHeight;
  const scaleX = fit.backingWidth / PLAYING_AREA_WIDTH;
  const scaleY = fit.backingHeight / PLAYING_AREA_HEIGHT;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
}
