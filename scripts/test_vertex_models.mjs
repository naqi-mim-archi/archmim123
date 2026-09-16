import { GoogleAuth } from 'google-auth-library';

async function testModel(model) {
  try {
    const auth = new GoogleAuth({
      keyFile: 'ml/auto_plan/rendair_gcp_key.json',
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    
    const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/${model}:generateContent`;
    
    const res = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'a simple red box' }] }],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['IMAGE']
        }
      })
    });
    
    const text = await res.text();
    console.log(`[${model}] status:`, res.status);
    try {
      const data = JSON.parse(text);
      const imagePart = data?.candidates
        ?.flatMap(candidate => candidate.content?.parts || [])
        .find(part => part.inlineData?.data);
      console.log(`[${model}] Has image bytes:`, !!imagePart?.inlineData?.data);
      if (!imagePart?.inlineData?.data) {
        console.log(`[${model}] Response keys:`, Object.keys(data), 'Data:', JSON.stringify(data).substring(0, 1000));
      }
    } catch {
      console.log(`[${model}] Non-JSON response start:`, text.substring(0, 200));
    }
  } catch (e) {
    console.error(`[${model}] Failed:`, e.message);
  }
}

async function run() {
  await testModel('gemini-3.1-flash-image');
  await testModel('gemini-3-pro-image');
  await testModel('gemini-2.5-flash-image');
}
run();
