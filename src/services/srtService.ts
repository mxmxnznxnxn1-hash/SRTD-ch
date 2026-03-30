import { GoogleGenAI } from "@google/genai";

// Parse multiple API keys from environment variable (newline or comma separated)
const apiKeys = (process.env.GEMINI_API_KEY || "")
  .split(/[\n,]/)
  .map(k => k.trim())
  .filter(k => k !== "");

export interface SubtitleBlock {
  index: string;
  timestamp: string;
  text: string;
}

export async function checkApiKey(key: string): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: "Hi" }] }],
    });
    return !!response.text;
  } catch (error) {
    console.error("Key check failed:", error);
    return false;
  }
}

export function parseSRT(content: string): SubtitleBlock[] {
  const blocks: SubtitleBlock[] = [];
  const rawBlocks = content.trim().split(/\n\s*\n/);

  for (const block of rawBlocks) {
    const lines = block.split("\n");
    if (lines.length >= 3) {
      const index = lines[0].trim();
      const timestamp = lines[1].trim();
      const text = lines.slice(2).join("\n").trim();
      blocks.push({ index, timestamp, text });
    }
  }
  return blocks;
}

export function stringifySRT(blocks: SubtitleBlock[]): string {
  return blocks
    .map((block) => `${block.index}\n${block.timestamp}\n${block.text}\n`)
    .join("\n");
}

export async function translateSubtitleBlocks(
  blocks: SubtitleBlock[],
  onProgress: (progress: number) => void,
  customApiKey?: string
): Promise<SubtitleBlock[]> {
  const batchSize = 15;
  const translatedBlocks: SubtitleBlock[] = [];

  // Use custom key if provided, otherwise fallback to env keys
  const activeKeys = customApiKey 
    ? customApiKey.split(/[\n,]/).map(k => k.trim()).filter(k => k !== "")
    : (process.env.GEMINI_API_KEY || "").split(/[\n,]/).map(k => k.trim()).filter(k => k !== "");

  if (activeKeys.length === 0) {
    throw new Error("Vui lòng nhập API Key trong phần cài đặt.");
  }

  const getAI = (index: number) => {
    const key = activeKeys[index % activeKeys.length];
    return new GoogleGenAI({ apiKey: key });
  };

  for (let i = 0; i < blocks.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize);
    const ai = getAI(batchIndex);
    
    const batch = blocks.slice(i, i + batchSize);
    const textsToTranslate = batch.map((b) => b.text);

    const prompt = `Translate the following subtitle lines into Vietnamese. 
Keep the translation natural and concise. 
Maintain the same number of lines in the output.
Separate each translation with a unique delimiter "|||".

Subtitles:
${textsToTranslate.join("\n|||\n")}
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
      });

      const translatedText = response.text || "";
      const translations = translatedText.split("|||").map((t) => t.trim());

      batch.forEach((block, index) => {
        translatedBlocks.push({
          ...block,
          text: translations[index] || block.text, // Fallback to original if translation fails
        });
      });
    } catch (error) {
      console.error(`Translation error with key index ${batchIndex % apiKeys.length}:`, error);
      // Fallback for the whole batch
      batch.forEach((block) => {
        translatedBlocks.push({ ...block });
      });
    }

    onProgress(Math.min(100, Math.round(((i + batchSize) / blocks.length) * 100)));
  }

  return translatedBlocks;
}
