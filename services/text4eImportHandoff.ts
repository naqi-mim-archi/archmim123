import type { ArchElement } from '../types';

const TEXT4E_AUTHORITATIVE_PREVIEW_KEY = 'text4eAuthoritativePreview';

export const markText4eAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4E_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4eAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4E_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4eImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4eAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
