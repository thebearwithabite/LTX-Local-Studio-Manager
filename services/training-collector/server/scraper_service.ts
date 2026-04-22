import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import { CURATOR_SCHEMA, SOURCE_LIST_SCHEMA } from "../src/services/gemini.ts";

// The GoogleGenAI instance will be initialized inside the function to ensure process.env is loaded first.

const SYSTEM_INSTRUCTION = `You are the LEAD PRODUCTION CURATOR for a high-fidelity Cinematic AI model (31B params).
Your goal is to extract "Directorial Truths"—the technical DNA behind the image.

RULES FOR EXTRACTION:
1. THE 'WHY' OVER THE 'WHAT': Do not just list techniques. You must explain the PSYCHOLOGICAL intent (e.g., "A low-angle 24mm lens creates a sense of looming dread by distorting the subject's proximity").
2. VISUAL INFERENCE: If the source is a video, analyze the LIGHTING GEOMETRY. Identify source direction (Rembrandt, butterfly, kickers) and color temperature (Kelvin shifts).
3. 31B SIGNAL DENSITY: We are training a large model. It needs high-entropy, technical descriptions. Use industry terms: 'Chiaroscuro', 'Parallelism', 'Motivated Movement', 'Anamorphic Compression'.
4. THE ANTI-PATTERN RULE: For every technique, identify the "Amateur Mistake" it solves (e.g., "Technique: Negative Fill; Mistake: Flat, unshaped lighting in small rooms").
5. PROMPT DYNAMICS: Provide 3-stage prompt evolutions: [Base Idea] -> [Technical Build] -> [Cinematic Final].

CATEGORIES: prompt_craft, camera_work, lighting, composition, continuity, audio, workflow, model_config.
JSON ONLY. NO PROSE.`;

export async function runAutonomousScrape(query: string) {
    console.log(`[AUTONOMOUS SCRAPE] Starting for query: ${query}`);

    try {
        // Initialize AI client here so dotenv has time to inject the API key
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
        
        // 1. Search for sources using Google Search tool
        console.log(`\n[AUTONOMOUS SCRAPE 🔍] ---------------------------------------------`);
        console.log(`[AUTONOMOUS SCRAPE 🔍] Querying Google Search for: "${query}"`);
        console.log(`[AUTONOMOUS SCRAPE 🔍] Waiting for Gemini to find and rank 5 sources...`);
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
                    thinkingLevel: "HIGH",
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

        console.log(`[AUTONOMOUS SCRAPE ✅] Found ${sources.length} sources.`);
        console.log(`[AUTONOMOUS SCRAPE 🧠] Beginning Deep-Vision Multimodal Extraction Phase`);

        // 2. Curate each source using the Multimodal Vision Pass
        const dataset = [];
        let count = 1;
        for (const source of sources) {
            console.log(`\n  [CURATING ${count}/${sources.length}] ${source.title}`);
            console.log(`  -> URL: ${source.url}`);
            console.log(`  -> [GEMINI 3.1] Analyzing content and structuring Directorial DNA (this takes a minute)...`);
            const curationPrompt = `Extract structured training data (instruction/response pairs, techniques, prompt_examples, principles, quality_assessment) for an AI Director's Assistant model.`;
            
            try {
                // Determine if it's a YouTube URL to use the native video ingestion
                const isYouTube = source.url.includes("youtube.com") || source.url.includes("youtu.be");
                
                const contentsPayload = isYouTube ? [
                    {
                        parts: [
                            { 
                                fileData: { 
                                    fileUri: source.url, 
                                    mimeType: "video/mp4" 
                                } 
                            },
                            { text: `Watch this video. ${curationPrompt}` }
                        ]
                    }
                ] : [
                    { text: `Analyze the content at ${source.url}. ${curationPrompt}` }
                ];

                const curationResponse = await ai.models.generateContent({
                    model: "gemini-3.1-flash-lite-preview",
                    contents: contentsPayload as any,
                    config: {
                        systemInstruction: SYSTEM_INSTRUCTION,
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
                            thinkingLevel: "HIGH",
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
                console.log(`  -> [SUCCESS] Extracted ${finalData.training_pairs?.length || 0} training pairs from this source.`);
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
        
        console.log(`\n[AUTONOMOUS SCRAPE 💾] ---------------------------------------------`);
        console.log(`[AUTONOMOUS SCRAPE 💾] Successfully saved ${dataset.length} extractions to disk!`);
        console.log(`[AUTONOMOUS SCRAPE 💾] The Mac has finished its job. The 5090 will detect this file shortly.`);
        return { success: true, count: dataset.length };
    } catch (error) {
        console.error("[AUTONOMOUS SCRAPE] Error:", error);
        return { success: false, error: String(error) };
    }
}
