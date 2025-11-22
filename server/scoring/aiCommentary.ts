import OpenAI from "openai";
import type { ContactScoreResult } from './contactScoring';
import type { ScoringCommentary, CategoryComment } from './scoringCommentary';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * AI-POWERED SCORING COMMENTARY ENGINE
 * 
 * Uses OpenAI to generate dynamic, context-aware commentary
 * for contact scoring profiles.
 */

/**
 * Generate AI-powered commentary using OpenAI
 */
export async function generateAICommentary(scoreResult: ContactScoreResult, contactName?: string): Promise<ScoringCommentary> {
  const categorySummary = scoreResult.categories.map(cat => {
    const signals = cat.signals.map(s => s.description).join(', ');
    return `${cat.category}: ${cat.score}/${cat.maxScore} pts${signals ? ` (${signals})` : ''}`;
  }).join('\n');

  const prompt = `You are an A&R professional analyzing a songwriter/artist for publishing opportunities. Generate punchy, confident commentary for this scoring profile:

Contact: ${contactName || 'Unknown Artist'}
Overall Score: ${scoreResult.finalScore}/10
Confidence: ${scoreResult.confidence}

Category Breakdown:
${categorySummary}

Generate a JSON response with the following structure:
{
  "topLine": "One punchy sentence summarizing the overall opportunity (15-20 words max)",
  "categoryComments": [
    {
      "categoryName": "Publishing Status",
      "comment": "Punchy, opportunity-focused commentary (10-15 words)"
    },
    // ... one for each category
  ],
  "opportunityNote": "Action-oriented opportunity assessment (20-30 words)",
  "priorityLevel": "high" | "medium" | "low"
}

Guidelines:
- Use emoji sparingly (max 1 per comment)
- Focus on opportunity language ("wide-open", "prime candidate", "reachable")
- Be direct and confident
- Highlight what makes this contact actionable
- Avoid generic phrases
- Use industry terms (A&R, publishing rights, unsigned talent)

Respond ONLY with valid JSON, no markdown formatting.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert A&R professional specializing in music publishing. Provide punchy, actionable insights in JSON format only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    // Remove markdown code blocks if present
    const cleanedContent = content.replace(/```json\n?|\n?```/g, "").trim();
    
    const aiResponse = JSON.parse(cleanedContent);
    
    // Validate and structure the response
    return {
      topLine: aiResponse.topLine || "Emerging talent with unsigned potential.",
      categoryComments: aiResponse.categoryComments || generateFallbackComments(scoreResult),
      opportunityNote: aiResponse.opportunityNote || "Monitor for development and growth indicators.",
      priorityLevel: aiResponse.priorityLevel || determinePriorityLevel(scoreResult.finalScore)
    };
  } catch (error: any) {
    console.error('[AI Commentary] Error generating AI commentary:', error.message);
    
    // Fallback to structured commentary on error
    return {
      topLine: generateFallbackTopLine(scoreResult),
      categoryComments: generateFallbackComments(scoreResult),
      opportunityNote: generateFallbackOpportunity(scoreResult),
      priorityLevel: determinePriorityLevel(scoreResult.finalScore)
    };
  }
}

/**
 * Generate fallback comments if AI fails
 */
function generateFallbackComments(scoreResult: ContactScoreResult): CategoryComment[] {
  return scoreResult.categories.map(cat => ({
    categoryName: cat.category,
    comment: cat.signals.length > 0 
      ? cat.signals[0].description 
      : `${cat.category}: ${cat.score}/${cat.maxScore} points`,
    score: cat.score,
    maxScore: cat.maxScore
  }));
}

/**
 * Fallback top-line summary
 */
function generateFallbackTopLine(scoreResult: ContactScoreResult): string {
  const score = scoreResult.finalScore;
  
  if (score >= 8) return "High-potential unsigned candidate with strong indicators.";
  if (score >= 5) return "Emerging artist with promising unsigned signals.";
  return "Developing artist worth monitoring.";
}

/**
 * Fallback opportunity note
 */
function generateFallbackOpportunity(scoreResult: ContactScoreResult): string {
  const score = scoreResult.finalScore;
  
  if (score >= 8) return "Prime outreach candidate — strong unsigned indicators across multiple categories.";
  if (score >= 5) return "Good monitoring candidate — shows unsigned potential with room for growth.";
  return "Track for future development — indicators suggest gradual movement.";
}

/**
 * Determine priority level
 */
function determinePriorityLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 8) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}
