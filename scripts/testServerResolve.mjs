import fetch from 'node-fetch';

async function test() {
  const url = 'http://localhost:3001/services/localImageToJSON4g.ts?t=' + Date.now();
  console.log('Fetching:', url);
  const res = await fetch(url);
  const text = await res.text();
  console.log('Fetched length:', text.length);
  
  // Look for elementsOverlapInPlan
  const lines = text.split('\n');
  const overlapLine = lines.findIndex(l => l.includes('elementsOverlapInPlan'));
  console.log('overlapLine index:', overlapLine);
  if (overlapLine !== -1) {
    console.log('Lines around elementsOverlapInPlan:');
    console.log(lines.slice(overlapLine, overlapLine + 30).join('\n'));
  } else {
    console.log('elementsOverlapInPlan NOT found in response!');
  }
}

test().catch(console.error);
