import { WORKFLOWS } from '../services/aiRender/workflowRegistry';
import { MODELS, WorkflowCostEstimator, ActualUsageCostCalculator, isControlNetSupported, CONTROLNET_MODELS } from '../services/aiRender/modelPricingRegistry';
import { IntentNormalizer, DefaultResolver, PromptCompiler } from '../services/aiRender/promptCompiler';
import { PromptEnhancerEngine } from '../services/aiRender/promptEnhancer';
import { routeAiRenderApiRequest } from '../services/aiRender/backend';

async function executeTestSuite() {
  let passedTests = 0;
  let failedTests = 0;

  const testAssert = (condition: boolean, message: string) => {
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${message}`);
    } else {
      failedTests++;
      console.error(`[FAIL] ${message}`);
    }
  };

  try {
    console.log('=== STARTING AI RENDERING PLATFORM TESTS ===\n');

    // Test 1: Registry Integrity
    testAssert(Object.keys(WORKFLOWS).length === 31, 'Workflow Registry has exactly 31 workflows');
    testAssert(WORKFLOWS[1].slug === 'text-to-render', 'Workflow 1 is text-to-render');
    testAssert(WORKFLOWS[30].slug === 'image-to-scene', 'Workflow 30 is image-to-scene');
    testAssert(WORKFLOWS[31].slug === 'reference-guided', 'Workflow 31 is reference-guided');

    // Test 2: Intent Normalizer
    const rawInput = "Give me an interior render with natural oak floor and warm design";
    const intent = IntentNormalizer.parseFromText(rawInput);
    testAssert(intent.materials.includes('natural oak'), 'Intent normalizer extracts materials: natural oak');
    testAssert(intent.interior_style === 'warm contemporary minimal', 'Intent normalizer resolves styles');

    // Test 3: Default Resolver
    const resolved = DefaultResolver.resolve(intent);
    testAssert(resolved.lighting === 'soft natural daylight', 'Default resolver resolves lighting defaults');
    testAssert(resolved.camera_angle === 'eye-level architectural photography', 'Default resolver resolves camera defaults');

    // Test 4: Prompt Compiler
    const workflow = WORKFLOWS[1];
    const compiled = PromptCompiler.compile(workflow, resolved);
    testAssert(compiled.includes('PROJECT: residential interior'), 'Prompt compiler matches project layout');
    testAssert(compiled.includes('QUALITY AND REALISM:'), 'Prompt compiler injects universal quality block');

    // Test 4b: Prompt Enhancer Style Detection & Exhaustive Non-Residential Categories
    const classicalPrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Classical interior living hall with wainscoting", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(classicalPrompt.toLowerCase().includes('classical architectural style'), 'Prompt enhancer detects user classical style override');
    testAssert(classicalPrompt.toLowerCase().includes('carved mahogany'), 'Prompt enhancer injects classical materials');

    const highRisePrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Glass skyscraper high rise building exterior facade", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(highRisePrompt.toLowerCase().includes('project:') && highRisePrompt.toLowerCase().includes('commercial'), 'Prompt enhancer classifies commercial high-rise exterior');
    testAssert(highRisePrompt.toLowerCase().includes('glass curtain wall'), 'Prompt enhancer injects commercial high-rise materials');

    const restaurantPrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Boutique fine dining restaurant lounge interior", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(restaurantPrompt.toLowerCase().includes('project:') && restaurantPrompt.toLowerCase().includes('hospitality'), 'Prompt enhancer classifies restaurant hospitality interior');

    // Test 4c: 6-Tier Architectural Schema Validation
    const schemaTestPrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Modern villa with infinity pool and bathroom", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image", camera_angle: "custom", custom_camera: "50mm tilt-shift lens from left corner", lighting: "custom", custom_lighting: "3000K warm cove LED strip glow" });
    testAssert(schemaTestPrompt.includes('PROJECT:'), 'Prompt enhancer includes PROJECT tier');
    testAssert(schemaTestPrompt.includes('DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE):'), 'Prompt enhancer includes DESIGN tier');
    testAssert(schemaTestPrompt.includes('CONTEXT:'), 'Prompt enhancer includes CONTEXT tier');
    testAssert(schemaTestPrompt.includes('MATERIAL:'), 'Prompt enhancer includes MATERIAL tier');
    testAssert(schemaTestPrompt.includes('LIGHTING:'), 'Prompt enhancer includes LIGHTING tier');
    testAssert(schemaTestPrompt.includes('VIS STYLE:'), 'Prompt enhancer includes VIS STYLE tier');
    testAssert(schemaTestPrompt.includes('50mm tilt-shift lens from left corner'), 'Prompt enhancer applies custom camera angle');
    testAssert(schemaTestPrompt.includes('3000K warm cove LED strip glow'), 'Prompt enhancer applies custom lighting setup');

    // Test 4d: Neutral Fallbacks for Stadiums and Out-of-Syllabus Prompts (No Residential Bleed)
    const stadiumPrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Cricket Stadium", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(stadiumPrompt.toLowerCase().includes('sports & athletic venue'), 'Prompt enhancer classifies Cricket Stadium as sports venue');
    testAssert(!stadiumPrompt.toLowerCase().includes('residential interior') && !stadiumPrompt.toLowerCase().includes('contemporary living space'), 'Prompt enhancer does NOT inject residential defaults into Cricket Stadium');

    const beachPrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "a sandy beach with palm trees", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(beachPrompt.toLowerCase().includes('landscape & natural environment') || beachPrompt.toLowerCase().includes('landscape & outdoor architecture'), 'Prompt enhancer classifies sandy beach as landscape');
    testAssert(!beachPrompt.toLowerCase().includes('residential interior') && !beachPrompt.toLowerCase().includes('curated contemporary designer furniture'), 'Prompt enhancer does NOT inject residential furniture into a beach');

    const cavePrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "inside a limestone cave with stalactites", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(!cavePrompt.toLowerCase().includes('curated contemporary designer furniture'), 'Prompt enhancer does NOT inject residential furniture into a cave');

    const spacePrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "orbital space station interior corridor", workflow_id: 1, image_style: "realistic", model: "gemini-3-pro-image" });
    testAssert(spacePrompt.toLowerCase().includes('aerospace') || spacePrompt.toLowerCase().includes('orbital'), 'Prompt enhancer handles orbital space station safely');
    testAssert(!spacePrompt.toLowerCase().includes('residential interior'), 'Prompt enhancer does NOT inject residential interior into a space station');

    // Test 4e: Reference Image Fidelity & ControlNet Directives
    const sketchWithImagePrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "Modern residential facade", workflow_id: 2, image_style: "realistic", model: "gemini-3-pro-image", has_reference_image: true, controlnet_enabled: true, controlnet_strength: 85 });
    testAssert(sketchWithImagePrompt.includes('REFERENCE IMAGE FIDELITY (SKETCH-TO-RENDER)'), 'Prompt enhancer injects sketch-to-render structural fidelity directive');
    testAssert(sketchWithImagePrompt.includes('85%'), 'Prompt enhancer injects ControlNet conditioning fidelity percentage');

    const planWithImagePrompt = PromptEnhancerEngine.enhanceOffline({ user_input: "3 bedroom luxury apartment", workflow_id: 6, image_style: "realistic", model: "gemini-3-pro-image", has_reference_image: true });
    testAssert(planWithImagePrompt.includes('REFERENCE IMAGE FIDELITY (PLAN-TO-3D)'), 'Prompt enhancer injects plan-to-3d layout fidelity directive');

    // Test 4g: Multi-Image Reference Synthesis
    const multiImagePrompt = PromptEnhancerEngine.enhanceOffline({
      user_input: "Take the living room space from Image 1, insert the modern velvet sofa from Image 2 in center, and apply white oak flooring from Image 3",
      workflow_id: 1,
      image_style: "realistic",
      model: "gemini-3-pro-image",
      reference_images_count: 3,
      reference_images_metadata: [
        { id: "1", name: "room_base.png", label: "Living Room Space" },
        { id: "2", name: "sofa_reference.jpg", label: "Velvet Sofa" },
        { id: "3", name: "flooring_swatch.png", label: "White Oak Flooring" }
      ]
    });
    testAssert(multiImagePrompt.includes('MULTI-IMAGE ARCHITECTURAL COMPOSITION & ELEMENT SYNTHESIS'), 'Prompt enhancer injects multi-image architectural synthesis directive');
    testAssert(multiImagePrompt.includes('Image 1 (Living Room Space) [room_base.png]'), 'Multi-image description includes Image 1 metadata');
    testAssert(multiImagePrompt.includes('Image 2 (Velvet Sofa) [sofa_reference.jpg]'), 'Multi-image description includes Image 2 metadata');
    testAssert(multiImagePrompt.includes('Image 3 (White Oak Flooring) [flooring_swatch.png]'), 'Multi-image description includes Image 3 metadata');

    // Test 4h: Reference-Guided Dual Channel Synthesis (Workflow 31)
    const refGuidedPrompt = PromptEnhancerEngine.enhanceOffline({
      user_input: "Render the apartment floor plan using warm modern Scandinavian style from reference",
      workflow_id: 31,
      image_style: "realistic",
      model: "gemini-3-pro-image",
      reference_images_count: 2,
      reference_images_metadata: [
        { id: "1", name: "apartment_floorplan.png", category: "drawing", drawingType: "Floor Plan", label: "Ground Floor Plan Layout" },
        { id: "2", name: "scandinavian_living.jpg", category: "reference", referenceAspects: ["Lighting & Atmosphere", "Materials & Textures"], label: "Scandinavian Style & Lighting" }
      ]
    });
    testAssert(refGuidedPrompt.includes('ARCHITECTURAL LAYOUT & GEOMETRY (Drawing Authority)'), 'Prompt enhancer specifies Drawing Authority header');
    testAssert(refGuidedPrompt.includes('VISUAL STYLE, MATERIALS & LIGHTING (Reference Authority)'), 'Prompt enhancer specifies Reference Authority header');
    testAssert(refGuidedPrompt.includes('[Image 1: Design Drawing - Floorplan]'), 'Prompt enhancer names Drawing with [Image 1: Design Drawing - Floorplan]');
    testAssert(refGuidedPrompt.includes('[Image 2: Visual Reference - Lighting, Materials]'), 'Prompt enhancer names Reference with aspects [Image 2: Visual Reference - Lighting, Materials]');
    testAssert(refGuidedPrompt.includes('Produce an architectural/interior rendering following 100% of architectural and interior layout details as per the floorplan'), 'Prompt enhancer enforces 100% layout fidelity');
    testAssert(!refGuidedPrompt.includes('PROJECT: Residential'), 'Prompt enhancer does NOT inject hallucinated generic 6-tier headers for reference-guided');

    // Test 4f: ControlNet Model Compatibility Filtering
    testAssert(isControlNetSupported('flux-2-pro'), 'isControlNetSupported returns true for FLUX.2 Pro');
    testAssert(isControlNetSupported('stable-diffusion-xl'), 'isControlNetSupported returns true for Stable Diffusion XL');
    testAssert(!isControlNetSupported('flux-1'), 'isControlNetSupported returns false for deprecated FLUX.1');
    testAssert(!isControlNetSupported('gemini-3-pro-image'), 'isControlNetSupported returns false for Gemini 3 Pro');
    testAssert(!isControlNetSupported('gemini-3.1-flash-image'), 'isControlNetSupported returns false for Gemini 3.1 Flash');

    // Test 5: Cost Estimator Calculations
    const costPro2K = WorkflowCostEstimator.calculate(1, 'gemini-3-pro-image', { resolution: '2K', input_images_count: 1 });
    testAssert(Math.abs(costPro2K.estimateUsd - 0.1375) < 0.005, `Pro 2K cost estimate is correct: $${costPro2K.estimateUsd} (Expected ~$0.1375)`);

    const costFlash2K = WorkflowCostEstimator.calculate(1, 'gemini-3.1-flash-image', { resolution: '2K', input_images_count: 1 });
    testAssert(Math.abs(costFlash2K.estimateUsd - 0.1019) < 0.005, `Flash 2K cost estimate is correct: $${costFlash2K.estimateUsd} (Expected ~$0.1019)`);

    const costVeo720p = WorkflowCostEstimator.calculate(28, 'veo-3.1-lite', { resolution: '720p', duration_seconds: 4, audio: false });
    testAssert(costVeo720p.estimateUsd === 0.12, `Veo 720p 4s video cost is $0.12: $${costVeo720p.estimateUsd}`);

    const costGPUWarm = WorkflowCostEstimator.calculate(2, 'flux-2-pro', {});
    testAssert(costGPUWarm.estimateUsd > 0.01 && costGPUWarm.estimateUsd < 0.05, `Flux 2 Pro warm GPU estimate matches bounds: $${costGPUWarm.estimateUsd}`);

    // Test 6: Actual Usage Cost Calculator
    const actualGPU = ActualUsageCostCalculator.calculate('flux-2-pro', 45, {});
    testAssert(Math.abs(actualGPU - 0.02960) < 0.0001, `Actual GPU billed with 30s idle self-termination window: $${actualGPU} (Expected ~$0.02960)`);

    // Test 7: API Routing
    console.log('\nTesting Mock API Route Handlers...');
    
    let statusCode = 200;
    const mockResponse = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        this.payload = payload;
      },
      payload: null as any
    };

    // List Workflows
    const handledList = await routeAiRenderApiRequest({ method: 'GET', url: '/api/ai-render/workflows' }, mockResponse);
    testAssert(handledList && statusCode === 200 && mockResponse.payload.length === 31, 'Routed GET /api/ai-render/workflows successfully');

    // Create Job
    const createReq = {
      method: 'POST',
      url: '/api/ai-render/jobs',
      body: {
        workflow_id: 1,
        model: 'gemini-3.1-flash-image',
        user_input: 'Luxurious dining room',
        options: { resolution: '2K' }
      }
    };
    const handledCreate = await routeAiRenderApiRequest(createReq, mockResponse);
    testAssert(handledCreate && mockResponse.payload.jobId, `Job created successfully: ${mockResponse.payload?.jobId}`);
    const createdJobId = mockResponse.payload?.jobId;

    // Poll Job Status
    const handledPoll = await routeAiRenderApiRequest({ method: 'GET', url: `/api/ai-render/jobs/${createdJobId}` }, mockResponse);
    const status = mockResponse.payload?.status;
    testAssert(handledPoll && (status === 'queued' || status === 'normalizing' || status === 'preprocessing'), `Job initial state is queued or processing: ${status}`);

    console.log('\n=== TEST RUN COMPLETE ===');
    console.log(`PASSED: ${passedTests}`);
    console.log(`FAILED: ${failedTests}`);

    if (failedTests > 0) {
      process.exit(1);
    } else {
      setTimeout(() => process.exit(0), 50);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

executeTestSuite();
