import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_INSTRUCTION = `You are a DATASET CURATOR for training a 2B parameter AI Director's Assistant model.
Your job is to extract structured training data from filmmaking and AI video generation content.
FOCUS ON JUDGMENT: Don't just list facts. Explain WHEN and WHY to use techniques.
SIGNAL DENSITY: Keep descriptions concise but specific.`;

export async function runAutonomousScrape(query: string) {
    console.log(`[AUTONOMOUS SCRAPE] Starting for query: ${query}`);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite",
        systemInstruction: SYSTEM_INSTRUCTION 
    });

    try {
        // 1. Search for sources
        const searchPrompt = `Search for 5 high-quality, distinct sources about: ${query}. Respond with a JSON array of objects containing {title, url, channel}.`;
        const searchResult = await model.generateContent(searchPrompt);
        const searchResponse = await searchResult.response;
        const text = searchResponse.text();
        
        // Basic JSON extraction from response
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']') + 1;
        const sources = JSON.parse(text.substring(start, end));

        console.log(`[AUTONOMOUS SCRAPE] Found ${sources.length} sources.`);

        // 2. Curate each source
        const dataset = [];
        for (const source of sources) {
            console.log(`  Curating: ${source.title}`);
            const curationPrompt = `Analyze the content at ${source.url}. Extract structured training data (instruction/response pairs, techniques, principles). Output as JSON.`;
            const curationResult = await model.generateContent(curationPrompt);
            const curationResponse = await curationResult.response;
            const curationData = JSON.parse(curationResponse.text().substring(curationResponse.text().indexOf('{'), curationResponse.text().lastIndexOf('}') + 1));
            dataset.push(curationData);
        }

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
