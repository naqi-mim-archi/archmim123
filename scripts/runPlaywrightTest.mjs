import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to local server...');
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });
  await page.goto('http://localhost:3001/');
  await page.waitForTimeout(2000);

  console.log('Executing local Image-to-JSON tracing in browser context...');
  const imageFolder = 'C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\02. Docs\\05. Auto Plan\\Data set 01\\DS 12\\67 - ortho\\67.2';
  const imageName = fs.readdirSync(imageFolder).find(f => /_01_input-image_/i.test(f));
  const imagePath = path.join(imageFolder, imageName);
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const result = await page.evaluate(async (base64) => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      originalLog.apply(console, args);
    };
    try {
      const module = await import('/services/localImageToJSON4g.ts?t=' + Date.now());
      const geomResult = await module.extractGeometryFromLocalImage(base64, {
        requestedWidthMeters: 10.2,
        requestedDepthMeters: 8.83,
        awaitOcrCompletion: true,
      });
      return { geomResult, logs };
    } finally {
      console.log = originalLog;
    }
  }, base64Image);
  
  console.log('--- BROWSER CONSOLE LOGS ---');
  result.logs.forEach(log => console.log(log));
  console.log('----------------------------');

  console.log('Conversion Complete.');
  console.log('Doors:', JSON.stringify(result.geomResult.doors, null, 2));
  console.log('Windows:', JSON.stringify(result.geomResult.windows, null, 2));
  console.log('Openings:', JSON.stringify(result.geomResult.openings, null, 2));

  await browser.close();
}

run().catch(console.error);
