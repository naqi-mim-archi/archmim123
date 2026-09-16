import type { Point } from '../../../types';
import type { GeneratedData, GenerativeWizardMode } from '../types';
import { refineDesignRequirements, generateFloorplan } from './text';
import { refineDesignRequirements2 } from './text2';
import { completeText3Geometry, generateFloorplan3, refineDesignRequirements3 } from './text3';
import { completeText4Geometry, generateFloorplan4, refineDesignRequirements4 } from './text4';
import { generateFloorplan4a } from './text4a';
import { generateFloorplan4b } from './text4b';
import { generateFloorplan4c, refineDesignRequirements4c, completeText4cGeometry } from './text4c';
import { generateFloorplan4d, refineDesignRequirements4d, completeText4dGeometry, type Text4dImageConversionOptions } from './text4d';
import { generateFloorplan4e, refineDesignRequirements4e, completeText4eGeometry, type Text4eImageConversionOptions } from './text4e';
import { generateFloorplan4f, refineDesignRequirements4f, completeText4fGeometry, type Text4fImageConversionOptions } from './text4f';
import { generateFloorplan4g, refineDesignRequirements4g, completeText4gGeometry, type Text4gImageConversionOptions } from './text4g';
import { generateFloorplan4h, refineDesignRequirements4h, completeText4hGeometry, type Text4hImageConversionOptions } from './text4h';
import { generateFloorplan4j, refineDesignRequirements4j, completeText4jGeometry, type Text4jImageConversionOptions } from './text4j';
import type { ConfirmedText4cBrief } from '../../../services/text4cBrief';
import { legacySummaryToText4cBrief } from '../../../services/text4cBrief';
import type { ConfirmedText4dBrief } from '../../../services/text4dBrief';
import { legacySummaryToText4dBrief } from '../../../services/text4dBrief';
import type { ConfirmedText4eBrief } from '../../../services/text4eBrief';
import { legacySummaryToText4eBrief } from '../../../services/text4eBrief';
import type { ConfirmedText4fBrief } from '../../../services/text4fBrief';
import { legacySummaryToText4fBrief } from '../../../services/text4fBrief';
import type { ConfirmedText4gBrief } from '../../../services/text4gBrief';
import { legacySummaryToText4gBrief } from '../../../services/text4gBrief';
import type { ConfirmedText4hBrief } from '../../../services/text4hBrief';
import { legacySummaryToText4hBrief } from '../../../services/text4hBrief';
import type { ConfirmedText4jBrief } from '../../../services/text4jBrief';
import { legacySummaryToText4jBrief } from '../../../services/text4jBrief';

export interface WizardChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const isStructuredChatMode = (mode: GenerativeWizardMode): boolean =>
  mode === 'chat-v2' || mode === 'chat-v3' || mode === 'chat-v4' || mode === 'chat-v4a' || mode === 'chat-v4b' || mode === 'chat-v4c' || mode === 'chat-v4d' || mode === 'chat-v4e' || mode === 'chat-v4f' || mode === 'chat-v4g' || mode === 'chat-v4h' || mode === 'chat-v4j';

export const isSpatialTextMode = (mode: GenerativeWizardMode): boolean =>
  mode === 'chat-v3' || mode === 'chat-v4' || mode === 'chat-v4a' || mode === 'chat-v4b' || mode === 'chat-v4c' || mode === 'chat-v4d' || mode === 'chat-v4e' || mode === 'chat-v4f' || mode === 'chat-v4g' || mode === 'chat-v4h' || mode === 'chat-v4j';

export const refineRequirementsForMode = (
  mode: GenerativeWizardMode,
  history: WizardChatMessage[],
  text4cVariationIndex = 0,
) => {
  if (mode === 'chat-v4j') return refineDesignRequirements4j(history, text4cVariationIndex);
  if (mode === 'chat-v4h') return refineDesignRequirements4h(history, text4cVariationIndex);
  if (mode === 'chat-v4g') return refineDesignRequirements4g(history, text4cVariationIndex);
  if (mode === 'chat-v4f') return refineDesignRequirements4f(history, text4cVariationIndex);
  if (mode === 'chat-v4e') return refineDesignRequirements4e(history, text4cVariationIndex);
  if (mode === 'chat-v4d') return refineDesignRequirements4d(history, text4cVariationIndex);
  if (mode === 'chat-v4c') return refineDesignRequirements4c(history, text4cVariationIndex);
  if (mode === 'chat-v4' || mode === 'chat-v4a' || mode === 'chat-v4b') return refineDesignRequirements4(history);
  if (mode === 'chat-v3') return refineDesignRequirements3(history);
  if (mode === 'chat-v2') return refineDesignRequirements2(history);
  return refineDesignRequirements(history);
};

export const completeGeometryForMode = (
  mode: GenerativeWizardMode,
  data: GeneratedData,
  designSummary: string,
): GeneratedData => {
  if (mode === 'chat-v4j') return completeText4jGeometry(data, designSummary);
  if (mode === 'chat-v4h') return completeText4hGeometry(data, designSummary);
  if (mode === 'chat-v4g') return completeText4gGeometry(data, designSummary);
  if (mode === 'chat-v4f') return completeText4fGeometry(data, designSummary);
  if (mode === 'chat-v4e') return completeText4eGeometry(data, designSummary);
  if (mode === 'chat-v4d') return completeText4dGeometry(data, designSummary);
  if (mode === 'chat-v4c') return completeText4cGeometry(data, designSummary);
  if (mode === 'chat-v4' || mode === 'chat-v4a' || mode === 'chat-v4b') return completeText4Geometry(data, designSummary);
  if (mode === 'chat-v3') return completeText3Geometry(data, designSummary);
  return data;
};

export const generateChatFloorplanForMode = (
  mode: GenerativeWizardMode,
  designSummary: string,
  currentBoundary?: Point[],
  requestedBoundary?: Point[],
  confirmedText4cBrief?: ConfirmedText4cBrief,
  confirmedText4dBrief?: ConfirmedText4dBrief,
  text4dConversionOptions?: Pick<Text4dImageConversionOptions, 'onGeometryReady'>,
  confirmedText4eBrief?: ConfirmedText4eBrief,
  text4eConversionOptions?: Pick<Text4eImageConversionOptions, 'onGeometryReady'>,
  confirmedText4fBrief?: ConfirmedText4fBrief,
  text4fConversionOptions?: Pick<Text4fImageConversionOptions, 'onGeometryReady'>,
  confirmedText4gBrief?: ConfirmedText4gBrief,
  text4gConversionOptions?: Pick<Text4gImageConversionOptions, 'onGeometryReady'>,
  confirmedText4hBrief?: ConfirmedText4hBrief,
  text4hConversionOptions?: Pick<Text4hImageConversionOptions, 'onGeometryReady'>,
  confirmedText4jBrief?: ConfirmedText4jBrief,
  text4jConversionOptions?: Pick<Text4jImageConversionOptions, 'onGeometryReady'>,
) => {
  if (mode === 'chat-v4j') {
    return generateFloorplan4j(
      confirmedText4jBrief || legacySummaryToText4jBrief(designSummary),
      requestedBoundary,
      text4jConversionOptions,
    );
  }
  if (mode === 'chat-v4h') {
    return generateFloorplan4h(
      confirmedText4hBrief || legacySummaryToText4hBrief(designSummary),
      requestedBoundary,
      text4hConversionOptions,
    );
  }
  if (mode === 'chat-v4g') {
    return generateFloorplan4g(
      confirmedText4gBrief || legacySummaryToText4gBrief(designSummary),
      requestedBoundary,
      text4gConversionOptions,
    );
  }
  if (mode === 'chat-v4f') {
    return generateFloorplan4f(
      confirmedText4fBrief || legacySummaryToText4fBrief(designSummary),
      requestedBoundary,
      text4fConversionOptions,
    );
  }
  if (mode === 'chat-v4e') {
    return generateFloorplan4e(
      confirmedText4eBrief || legacySummaryToText4eBrief(designSummary),
      requestedBoundary,
      text4eConversionOptions,
    );
  }
  if (mode === 'chat-v4d') {
    return generateFloorplan4d(
      confirmedText4dBrief || legacySummaryToText4dBrief(designSummary),
      requestedBoundary,
      text4dConversionOptions,
    );
  }
  if (mode === 'chat-v4c') {
    return generateFloorplan4c(confirmedText4cBrief || legacySummaryToText4cBrief(designSummary), requestedBoundary);
  }
  if (mode === 'chat-v4b') return generateFloorplan4b(designSummary, requestedBoundary);
  if (mode === 'chat-v4a') return generateFloorplan4a(designSummary, requestedBoundary);
  if (mode === 'chat-v4') return generateFloorplan4(designSummary, requestedBoundary);
  if (mode === 'chat-v3') return generateFloorplan3(designSummary, requestedBoundary);
  return generateFloorplan(designSummary, currentBoundary);
};
