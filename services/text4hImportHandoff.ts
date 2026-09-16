import type { ArchElement } from '../types';

const TEXT4H_AUTHORITATIVE_PREVIEW_KEY = 'text4hAuthoritativePreview';

export const markText4hAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4H_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4hAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4H_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4hImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4hAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
