import type { ArchElement } from '../types';

const TEXT4F_AUTHORITATIVE_PREVIEW_KEY = 'text4fAuthoritativePreview';

export const markText4fAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4F_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4fAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4F_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4fImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4fAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
