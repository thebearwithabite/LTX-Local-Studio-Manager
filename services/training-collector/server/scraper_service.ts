import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import { CURATOR_SCHEMA, SOURCE_LIST_SCHEMA } from "../src/services/gemini";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `You are a DATASET CURATOR for training a 2B parameter AI Director's Assistant model.
Your job is to extract structured training data from filmmaking and AI video generation content.

RULES FOR EXTRACTION:
1. MAXIMIZE training_pairs: Extract as many natural-sounding instruction/response pairs as possible (minimum 5 per source).
2. MINIMUM 2 prompt_examples: Capture complete prompts with context and iteration notes per source.
3. FOCUS ON JUDGMENT: Don't just list facts. Explain WHEN and WHY to use techniques (e.g., "use a low angle WHEN you want to convey power").
4. UNIVERSAL PRINCIPLES: Even if a specific model is discussed (Veo, LTX, etc.), extract the underlying filmmaking principle.
5. ANTI-PATTERNS: Identify common mistakes and how the technique corrects them.
6. SIGNAL DENSITY: Keep descriptions concise but specific. A 2B model needs high-quality, clear signal.
7. QUALITY SCORE: Rate the extracted data from 1-5 based on these rules. 5 is perfect signal density and deep directorial judgment.

CATEGORIES: prompt_craft, camera_work, lighting, composition, continuity, audio, workflow, model_config.`;

export async function runAutonomousScrape(query: string) {
    console.log(`[AUTONOMOUS SCRAPE] Starting for query: ${query}`);

    try {
        // 1. Search for sources using Google Search tool
        console.log(`[AUTONOMOUS SCRAPE] Searching for: ${query}`);
        const searchPrompt = `Search for and find 5 high-quality, distinct sources (videos or articles) about: ${query}. 
        Focus on AI video generation, filmmaking, cinematography, and prompt engineering.`;
        
        const searchResponse = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: searchPrompt,
            config: {
                tools: [{ googleSearch: {} }],
                toolConfig: {
                    includeServerSideToolInvocations: true
                },
                responseMimeType: "application/json",
                responseSchema: SOURCE_LIST_SCHEMA,
                // @ts-ignore
                thinkingConfig: {
                    thinkingLevel: "high",
                    includeThoughts: true
                }
            }
        });
        
        const searchData = JSON.parse(searchResponse.text);
        const sources = searchData.sources || searchData.results || [];

        if (sources.length === 0) {
            console.log("[AUTONOMOUS SCRAPE] No sources found.");
            return { success: false, error: "No sources found" };
        }

        console.log(`[AUTONOMOUS SCRAPE] Found ${sources.length} sources.`);

        // 2. Curate each source using URL Context tool
        const dataset = [];
        for (const source of sources) {
            console.log(`  Curating: ${source.title}`);
            const curationPrompt = `Analyze the content at ${source.url}. 
            Extract structured training data (instruction/response pairs, techniques, prompt_examples, principles, quality_assessment) for an AI Director's Assistant model.`;
            
            try {
                const curationResponse = await ai.models.generateContent({
                    model: "gemini-3.1-flash-lite-preview",
                    contents: curationPrompt,
                    config: {
                        systemInstruction: SYSTEM_INSTRUCTION,
                        tools: [{ urlContext: {} }],
                        toolConfig: {
                            includeServerSideToolInvocations: true
                        },
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                result: CURATOR_SCHEMA.properties.results.items
                            },
                            required: ["result"]
                        },
                        // @ts-ignore
                        thinkingConfig: {
                            thinkingLevel: "high",
                            includeThoughts: true
                        }
                    }
                });
                
                const curationData = JSON.parse(curationResponse.text);
                
                // Ensure source metadata is attached
                const finalData = curationData.result || curationData.results?.[0] || curationData;
                finalData.source = {
                    title: source.title,
                    url: source.url,
                    channel: source.channel || "Unknown",
                    date_watched: new Date().toISOString()
                };
                
                dataset.push(finalData);
            } catch (e) {
                console.error(`  Error curating ${source.url}:`, e);
            }
        }

        if (dataset.length === 0) return { success: false, error: "No data curated" };

        // 3. Save to data dir
        const workspaceRoot = "/Users/ryanthomson/Github/LTX-Local-Studio-Manager";
        const dataDir = path.join(workspaceRoot, "services/Training Data");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(dataDir, `auto_extraction_${timestamp}.json`);
        fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2));
        
        console.log(`[AUTONOMOUS SCRAPE] Saved ${dataset.length} extractions to ${filePath}`);
        return { success: true, count: dataset.length };
    } catch (error) {
        console.error("[AUTONOMOUS SCRAPE] Error:", error);
        return { success: false, error: String(error) };
    }
}
