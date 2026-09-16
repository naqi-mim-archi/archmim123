import type { ArchElement } from '../types';

const TEXT4J_AUTHORITATIVE_PREVIEW_KEY = 'text4jAuthoritativePreview';

export const markText4jAuthoritativePreview = (elements: ArchElement[]): ArchElement[] =>
  elements.map((element, index) => index === 0
    ? {
        ...element,
        metadata: {
          ...(element.metadata && typeof element.metadata === 'object' ? element.metadata : {}),
          [TEXT4J_AUTHORITATIVE_PREVIEW_KEY]: true,
        },
      }
    : element);

export const isText4jAuthoritativePreview = (elements: ArchElement[]): boolean =>
  elements.some(element => element.metadata?.[TEXT4J_AUTHORITATIVE_PREVIEW_KEY] === true);

export const finalizeText4jImportHandoff = (
  elements: ArchElement[],
  legacyHostNormalizer: (element: ArchElement) => ArchElement,
): ArchElement[] => isText4jAuthoritativePreview(elements)
  ? elements
  : elements.map(legacyHostNormalizer);
