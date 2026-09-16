import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || "";

// Keep the app bootable without a local Gemini key; AI features will fail only when used.
export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
