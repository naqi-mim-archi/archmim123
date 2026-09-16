import { Point } from "../types";

export const generateFloorplanText2Plan = async (
  designSummary: string, 
  boundaryPoints?: Point[]
) => {
  try {
    console.log("[Text2Plan] Sending generation request to local backend proxy...");
    
    const response = await fetch("/api/text2plan/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        designSummary,
        boundaryPoints
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      throw new Error(errorJson?.error || errorText || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error("Text2Plan Floorplan Error:", error);
    throw error;
  }
};
