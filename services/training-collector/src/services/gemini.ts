import { GoogleGenAI, Type } from "@google/genai";

// The GoogleGenAI instance will be initialized inside the functions to ensure process.env is loaded first.
export const CURATOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              channel: { type: Type.STRING },
              url: { type: Type.STRING },
              date_watched: { type: Type.STRING },
              relevance_tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["title", "channel", "url", "date_watched", "relevance_tags"]
          },
          quality_assessment: {
            type: Type.OBJECT,
            properties: {
              score: { 
                type: Type.INTEGER,
                description: "Quality score from 1-5 based on Claude's advice (signal density, judgment, reasoning)."
              },
              reasoning: { type: Type.STRING, description: "Explanation of the score." },
              coverage_check: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Which categories from the checklist are covered."
              }
            },
            required: ["score", "reasoning", "coverage_check"]
          },
          techniques: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                description: { type: Type.STRING },
                when_to_use: { type: Type.STRING },
                example_prompt: { type: Type.STRING },
                anti_pattern: { type: Type.STRING },
                model_specific: { type: Type.STRING }
              },
              required: ["name", "category", "description", "when_to_use", "example_prompt", "anti_pattern", "model_specific"]
            }
          },
          prompt_examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                prompt_text: { type: Type.STRING },
                context: { type: Type.STRING },
                result_quality: { type: Type.STRING },
                improvement_notes: { type: Type.STRING }
              },
              required: ["prompt_text", "context", "result_quality", "improvement_notes"]
            }
          },
          principles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                principle: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                qa_pair: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING }
                  },
                  required: ["question", "answer"]
                }
              },
              required: ["principle", "reasoning", "qa_pair"]
            }
          },
          workflow_steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.INTEGER },
                action: { type: Type.STRING },
                tool_or_node: { type: Type.STRING },
                parameter_notes: { type: Type.STRING }
              },
              required: ["step", "action", "tool_or_node", "parameter_notes"]
            }
          },
          training_pairs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                instruction: { type: Type.STRING },
                response: { type: Type.STRING }
              },
              required: ["instruction", "response"]
            }
          }
        },
        required: ["source", "quality_assessment", "techniques", "prompt_examples", "principles", "workflow_steps", "training_pairs"]
      }
    }
  },
  required: ["results"]
};

export const SOURCE_LIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          url: { type: Type.STRING },
          channel: { type: Type.STRING },
        },
        required: ["title", "url", "channel"]
      }
    }
  },
  required: ["sources"]
};

const SYSTEM_INSTRUCTION = `You are a DATASET CURATOR for training a 2B parameter AI Director's Assistant model.
Your job is to extract structured training data from filmmaking and AI video generation content.

RULES FOR EXTRACTION:
1. EXTRACT 5 DISTINCT SOURCES: For each search query, find 5 different high-quality videos or articles.
2. MAXIMIZE training_pairs: Extract as many natural-sounding instruction/response pairs as possible (minimum 5 per source).
3. MINIMUM 2 prompt_examples: Capture complete prompts with context and iteration notes per source.
4. FOCUS ON JUDGMENT: Don't just list facts. Explain WHEN and WHY to use techniques (e.g., "use a low angle WHEN you want to convey power").
5. UNIVERSAL PRINCIPLES: Even if a specific model is discussed (Veo, LTX, etc.), extract the underlying filmmaking principle.
6. ANTI-PATTERNS: Identify common mistakes and how the technique corrects them.
7. SIGNAL DENSITY: Keep descriptions concise but specific. A 2B model needs high-quality, clear signal.
8. QUALITY SCORE: Rate the extracted data from 1-5 based on these rules. 5 is perfect signal density and deep directorial judgment.

CATEGORIES: prompt_craft, camera_work, lighting, composition, continuity, audio, workflow, model_config.`;

export async function findSources(query: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: `Search for and find 5 high-quality, distinct sources (videos or articles) about: ${query}. 
    Focus on AI video generation, filmmaking, cinematography, and prompt engineering.`,
    config: {
      tools: [{ googleSearch: {} }],
      toolConfig: {
        includeServerSideToolInvocations: true
      },
      responseMimeType: "application/json",
      responseSchema: SOURCE_LIST_SCHEMA,
      maxOutputTokens: 8192,
      // @ts-ignore
      thinkingConfig: {
        thinkingLevel: "high",
        includeThoughts: true
      }
    }
  });

  const data = JSON.parse(response.text);
  return data.sources;
}

export async function curateSource(source: {title: string, url: string, channel: string}) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: `Analyze the following source: Title: ${source.title}, URL: ${source.url}, Channel: ${source.channel}.
    Extract structured training data for an AI Director's Assistant model based on this content.`,
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
      maxOutputTokens: 8192,
      // @ts-ignore
      thinkingConfig: {
        thinkingLevel: "high",
        includeThoughts: true
      }
    }
  });

  const data = JSON.parse(response.text);
  return data.result;
}

export async function curateFromUrl(url: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `Analyze the content at this URL: ${url}. 
      Extract structured training data for an AI Director's Assistant model.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ urlContext: {} }],
        toolConfig: {
          includeServerSideToolInvocations: true
        },
        responseMimeType: "application/json",
        responseSchema: CURATOR_SCHEMA,
        maxOutputTokens: 8192,
        // @ts-ignore
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: true
        }
      }
    });
  
    const data = JSON.parse(response.text);
    return data.results[0];
}
