import type { ArchElement } from '../types';

const TEXT4D_AUTHORITATIVE_PREVIEW_KEY = 'text4dAuthoritativePreview';

export const markText4dAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4D_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4dAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4D_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4dImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4dAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
