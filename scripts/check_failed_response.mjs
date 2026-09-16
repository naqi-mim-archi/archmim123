import { GoogleAuth } from 'google-auth-library';

async function run() {
  try {
    const auth = new GoogleAuth({
      keyFile: 'ml/auto_plan/rendair_gcp_key.json',
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    
    const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/gemini-3-pro-image:generateContent`;
    
    const res = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'TARGET: undefined\nREQUESTED MODIFICATION: undefined\nModify only the selected object. Preserve its position and physically appropriate scale unless requested otherwise. Match perspective, lighting, shadows and reflections. Everything outside the target should remain unchanged.' }] }],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ['IMAGE']
        }
      })
    });
    
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (e) {
    console.error(e);
  }
}
run();
