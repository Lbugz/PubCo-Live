import OpenAI from "openai";
import type { PlaylistSnapshot } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AIInsights {
  summary: string;
  outreachSuggestion: string;
  talkingPoints: string[];
  scoringRationale: string;
  priorityLevel: "high" | "medium" | "low";
}

export async function generateAIInsights(track: PlaylistSnapshot): Promise<AIInsights> {
  const prompt = `You are an A&R professional analyzing a potential publishing lead. Generate outreach insights for this track:

Track: ${track.trackName}
Artist: ${track.artistName}
Label: ${track.label || "Unknown"}
Publisher: ${track.publisher || "Unknown"}
Songwriter(s): ${track.songwriter || "Unknown"}
Unsigned Score: ${track.unsignedScore}/10
Playlist: ${track.playlistName}
ISRC: ${track.isrc || "N/A"}

Generate a concise analysis in the following JSON format:
{
  "summary": "2-3 sentence overview of why this is a good lead",
  "outreachSuggestion": "Specific outreach strategy (1-2 sentences)",
  "talkingPoints": ["Point 1", "Point 2", "Point 3"],
  "scoringRationale": "Why this track scored ${track.unsignedScore}/10 (1-2 sentences)",
  "priorityLevel": "high" | "medium" | "low"
}

Consider:
- Independent/unknown labels suggest unsigned artists
- Missing publisher/songwriter data indicates potential publishing opportunities
- Fresh Finds playlists feature emerging talent
- High unsigned scores indicate strong leads

Respond ONLY with valid JSON, no markdown or additional text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert A&R professional specializing in music publishing. Provide concise, actionable insights in JSON format only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    // Remove markdown code blocks if present
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    
    const insights: AIInsights = JSON.parse(cleanedContent);
    
    // Validate and provide defaults
    return {
      summary: insights.summary || "This track shows potential for publishing opportunities.",
      outreachSuggestion: insights.outreachSuggestion || "Research artist's social media presence and direct contact information.",
      talkingPoints: insights.talkingPoints || [
        "Track featured on curated playlist",
        "Potential for publishing representation",
        "Emerging artist with growth trajectory"
      ],
      scoringRationale: insights.scoringRationale || `Score reflects ${track.unsignedScore >= 7 ? "strong" : track.unsignedScore >= 4 ? "moderate" : "limited"} indicators of unsigned status.`,
      priorityLevel: insights.priorityLevel || (track.unsignedScore >= 7 ? "high" : track.unsignedScore >= 4 ? "medium" : "low"),
    };
  } catch (error) {
    console.error("Error generating AI insights:", error);
    
    // Fallback insights based on scoring rules
    return {
      summary: `${track.trackName} by ${track.artistName} scored ${track.unsignedScore}/10 on unsigned likelihood. ${track.unsignedScore >= 7 ? "Strong publishing opportunity." : track.unsignedScore >= 4 ? "Moderate potential." : "Lower priority lead."}`,
      outreachSuggestion: track.unsignedScore >= 7 
        ? "Priority outreach: Research artist management and reach out within 48 hours."
        : "Monitor artist's trajectory and engage when appropriate.",
      talkingPoints: [
        track.label?.includes("Independent") || !track.label ? "Independent or unknown label" : `Signed to ${track.label}`,
        !track.publisher ? "No publisher data found - potential opportunity" : `Publisher: ${track.publisher}`,
        `Featured on ${track.playlistName} playlist`,
      ],
      scoringRationale: `Score based on: ${!track.publisher ? "missing publisher (+3)" : ""}${!track.songwriter ? ", missing songwriter (+2)" : ""}${track.label?.toLowerCase().includes("independent") ? ", indie label (+2)" : ""}`,
      priorityLevel: track.unsignedScore >= 7 ? "high" : track.unsignedScore >= 4 ? "medium" : "low",
    };
  }
}
