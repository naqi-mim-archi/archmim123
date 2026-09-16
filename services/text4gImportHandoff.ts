import type { ArchElement } from '../types';

const TEXT4G_AUTHORITATIVE_PREVIEW_KEY = 'text4gAuthoritativePreview';

export const markText4gAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4G_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4gAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4G_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4gImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4gAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
