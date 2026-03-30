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
  isTranslated?: boolean;
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
      blocks.push({ index, timestamp, text, isTranslated: false });
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
  customApiKey?: string,
  context?: string,
  genre?: string,
  tone?: string,
  onlyUntranslated = false
): Promise<SubtitleBlock[]> {
  const batchSize = 30; // Increased batch size
  const translatedBlocks: SubtitleBlock[] = [...blocks];
  
  const activeKeys = customApiKey 
    ? customApiKey.split(/[\n,]/).map(k => k.trim()).filter(k => k !== "")
    : (process.env.GEMINI_API_KEY || "").split(/[\n,]/).map(k => k.trim()).filter(k => k !== "");

  if (activeKeys.length === 0) {
    throw new Error("Vui lòng nhập API Key trong phần cài đặt.");
  }

  const aiInstances = activeKeys.map(key => new GoogleGenAI({ apiKey: key }));
  
  // Helper for delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Function to translate a single batch with retry logic
  const translateBatch = async (batch: SubtitleBlock[], startIndex: number, aiIndex: number, attempt = 1): Promise<void> => {
    const ai = aiInstances[aiIndex % aiInstances.length];
    const textsToTranslate = batch.map((b) => b.text);

    const prompt = `Translate the following subtitle lines into Vietnamese. 
Keep the translation natural and concise. 
Maintain the same number of lines in the output.
Separate each translation with a unique delimiter "|||".

${genre ? `Genre: ${genre}\n` : ""}
${tone ? `Tone/Emotion: ${tone}\n` : ""}
${context ? `Context/Glossary:\n${context}\n` : ""}

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
        translatedBlocks[startIndex + index] = {
          ...block,
          text: translations[index] || block.text,
          isTranslated: !!translations[index],
        };
      });
    } catch (error: any) {
      const isRateLimit = error?.message?.includes("429") || error?.message?.toLowerCase().includes("quota");
      
      if (isRateLimit && attempt <= 5) {
        // Wait longer for each retry (exponential backoff)
        const waitTime = attempt * 5000 + Math.random() * 2000;
        await sleep(waitTime);
        return translateBatch(batch, startIndex, aiIndex, attempt + 1);
      } else if (attempt <= 3) {
        // Other errors, retry a few times
        await sleep(2000);
        return translateBatch(batch, startIndex, aiIndex, attempt + 1);
      }

      // Final fallback: keep original text
      batch.forEach((block, index) => {
        translatedBlocks[startIndex + index] = { ...block, isTranslated: false };
      });
      console.error(`Failed to translate batch at ${startIndex} after ${attempt} attempts:`, error);
    }
  };

  // Process batches with controlled concurrency
  const maxConcurrency = activeKeys.length;
  const batches = [];
  for (let i = 0; i < blocks.length; i += batchSize) {
    const batch = blocks.slice(i, i + batchSize);
    
    // If onlyUntranslated is true, skip batches where all blocks are already translated
    if (onlyUntranslated && batch.every(b => b.isTranslated)) {
      continue;
    }

    batches.push({
      batch,
      index: i
    });
  }

  let completed = 0;
  const totalBatches = batches.length;

  if (totalBatches === 0) {
    onProgress(100);
    return translatedBlocks;
  }

  // Process in chunks to avoid overwhelming the system
  for (let i = 0; i < totalBatches; i += maxConcurrency) {
    const currentChunk = batches.slice(i, i + maxConcurrency);
    await Promise.all(currentChunk.map((item, idx) => 
      translateBatch(item.batch, item.index, idx).then(() => {
        completed++;
        onProgress(Math.min(100, Math.round((completed / totalBatches) * 100)));
      })
    ));
    
    // Small delay between chunks to respect rate limits
    if (activeKeys.length === 1) {
      await sleep(3000); // Wait 3s if only 1 key
    } else {
      await sleep(1000); // Wait 1s if multiple keys
    }
  }

  return translatedBlocks;
}
