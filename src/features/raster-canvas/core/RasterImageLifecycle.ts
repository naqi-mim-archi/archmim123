export const shouldLoadInitialRasterImage = (
  loadedSource: string | null,
  nextSource: string | undefined,
): nextSource is string => Boolean(nextSource && loadedSource !== nextSource);
