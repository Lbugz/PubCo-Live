import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

// Mock scoring data
const mockCategories = [
  {
    category: "Publishing Status",
    score: 4.0,
    maxScore: 4,
    signals: [
      { description: "No publisher metadata across all tracks", weight: 4 }
    ]
  },
  {
    category: "Release Pathway",
    score: 3.0,
    maxScore: 3,
    signals: [
      { description: "DIY distributor detected", weight: 3 }
    ]
  },
  {
    category: "Early Career Signals",
    score: 2.0,
    maxScore: 2,
    signals: [
      { description: "Appears on Fresh Finds playlist", weight: 2 }
    ]
  },
  {
    category: "Metadata Quality",
    score: 0.5,
    maxScore: 1,
    signals: [
      { description: "Average data completeness: 56%", weight: 0.5 }
    ]
  },
  {
    category: "Catalog Patterns",
    score: 0.5,
    maxScore: 0.5,
    signals: [
      { description: "100% DIY/indie releases", weight: 0.5 }
    ]
  },
  {
    category: "Profile Verification",
    score: 0.5,
    maxScore: 0.5,
    signals: [
      { description: "Verified via MusicBrainz", weight: 0.5 }
    ]
  }
];

// Option 1: Insight Blocks (Current Implementation)
function Option1() {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  return (
    <div className="space-y-3">
      {mockCategories.map((category) => (
        <Card key={category.category} className="p-4">
          <Collapsible 
            open={expandedCategories.includes(category.category)}
            onOpenChange={() => toggleCategory(category.category)}
          >
            <CollapsibleTrigger asChild>
              <div className="cursor-pointer">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-base">{category.category}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {category.score.toFixed(1)} / {category.maxScore}
                    </span>
                    <ChevronDown 
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        expandedCategories.includes(category.category) && "rotate-180"
                      )}
                    />
                  </div>
                </div>
              </div>
            </CollapsibleTrigger>

            {category.signals && category.signals.length > 0 && (
              <CollapsibleContent>
                <div className="space-y-1.5 mt-3 pt-3 border-t">
                  {category.signals.map((signal, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span className="text-muted-foreground flex-1 leading-relaxed">
                        {signal.description}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            )}
          </Collapsible>
        </Card>
      ))}
    </div>
  );
}

// Option 2: Signal Ladders (Star Ratings)
function Option2() {
  const renderStars = (score: number, max: number) => {
    const filled = Math.round((score / max) * 5);
    return (
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-4 w-4",
              i < filled ? "fill-primary text-primary" : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {mockCategories.map((category) => (
        <Card key={category.category} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">{category.category}</h4>
            {renderStars(category.score, category.maxScore)}
          </div>
          <div className="text-sm text-muted-foreground mb-1">
            {category.score.toFixed(1)} / {category.maxScore} pts
          </div>
          <div className="space-y-1 mt-2">
            {category.signals.map((signal, idx) => (
              <div key={idx} className="text-sm text-muted-foreground flex gap-2">
                <span>•</span>
                <span>{signal.description}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// Option 3: Pill Grid
function Option3() {
  return (
    <div className="space-y-2">
      {mockCategories.map((category) => (
        <div
          key={category.category}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate cursor-pointer"
        >
          <span className="font-medium text-sm">{category.category}</span>
          <Badge variant="outline" className="font-semibold tabular-nums">
            {category.score.toFixed(1)} / {category.maxScore}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// Option 4: Mini Cards
function Option4() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {mockCategories.map((category) => (
        <Card key={category.category} className="p-3">
          <div className="text-xs text-muted-foreground mb-1">{category.category}</div>
          <div className="text-lg font-bold tabular-nums mb-2">
            {category.score.toFixed(1)} <span className="text-sm text-muted-foreground">/ {category.maxScore}</span>
          </div>
          {category.signals.map((signal, idx) => (
            <div key={idx} className="text-xs text-muted-foreground">
              {signal.description}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

// Option 5: Heatmap
function Option5() {
  const getHeatEmoji = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 75) return "🔥🔥🔥🔥";
    if (percentage >= 50) return "🔥🔥🔥";
    if (percentage >= 25) return "🔥🔥";
    if (percentage > 0) return "🔥";
    return "❄️";
  };

  return (
    <div className="space-y-2">
      {mockCategories.map((category) => (
        <div key={category.category} className="flex items-center gap-4 p-3 rounded-lg border">
          <div className="flex-1">
            <div className="font-medium text-sm">{category.category}</div>
            <div className="text-xs text-muted-foreground">
              {category.signals[0]?.description}
            </div>
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {category.score.toFixed(1)} / {category.maxScore}
          </div>
          <div className="text-lg">
            {getHeatEmoji(category.score, category.maxScore)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Option 6: Narrative Cards
function Option6() {
  const getNarrative = (category: any) => {
    const { category: name, score, maxScore, signals } = category;
    
    if (score === maxScore) {
      return `This songwriter shows ${signals[0]?.description.toLowerCase()}. Strong indicator detected.`;
    } else if (score > 0) {
      return `Partial signals detected: ${signals[0]?.description.toLowerCase()}.`;
    } else {
      return `No significant signals detected in this category.`;
    }
  };

  return (
    <div className="space-y-3">
      {mockCategories.map((category) => (
        <Card key={category.category} className="p-4">
          <div className="flex items-baseline gap-2 mb-2">
            <h4 className="font-medium">{category.category}</h4>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
              {category.score.toFixed(1)}/{category.maxScore}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {getNarrative(category)}
          </p>
        </Card>
      ))}
    </div>
  );
}

// Option 7: Compact Signal Rows
function Option7() {
  return (
    <div className="space-y-1">
      {mockCategories.map((category) => (
        <div key={category.category} className="flex items-center gap-4 p-2 rounded hover-elevate">
          <div className="flex-1 font-medium text-sm">{category.category}</div>
          <div className="font-semibold text-sm tabular-nums w-20 text-right">
            {category.score.toFixed(1)} / {category.maxScore}
          </div>
          <div className="flex-1 text-sm text-muted-foreground">
            {category.signals[0]?.description}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScoringPreview() {
  const totalScore = mockCategories.reduce((sum, cat) => sum + cat.score, 0);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Scoring UI Preview</h1>
          <p className="text-muted-foreground">
            Compare all 7 layout options for the unsigned songwriter scoring system.
            Total Score: <span className="font-semibold">{totalScore.toFixed(1)}/10</span>
          </p>
        </div>

        <Separator />

        {/* Option 1 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 1: Insight Blocks (Current)</h2>
            <p className="text-sm text-muted-foreground">
              Clean editorial cards with collapsible details. Premium, minimal aesthetic.
            </p>
          </div>
          <Option1 />
        </div>

        <Separator />

        {/* Option 2 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 2: Signal Ladders</h2>
            <p className="text-sm text-muted-foreground">
              Star ratings for quick visual scanning. Emotional but minimal.
            </p>
          </div>
          <Option2 />
        </div>

        <Separator />

        {/* Option 3 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 3: Pill Grid</h2>
            <p className="text-sm text-muted-foreground">
              Compact pills for ultra-clean layout. Click to expand details in side panel.
            </p>
          </div>
          <Option3 />
        </div>

        <Separator />

        {/* Option 4 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 4: Mini Cards</h2>
            <p className="text-sm text-muted-foreground">
              Grid of small cards. Great for dashboard-style overview.
            </p>
          </div>
          <Option4 />
        </div>

        <Separator />

        {/* Option 5 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 5: Heatmap</h2>
            <p className="text-sm text-muted-foreground">
              Visual intensity indicators. Fast A&R scanning with emoji heat levels.
            </p>
          </div>
          <Option5 />
        </div>

        <Separator />

        {/* Option 6 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 6: Narrative Cards</h2>
            <p className="text-sm text-muted-foreground">
              Human-readable paragraphs. Report-style presentation.
            </p>
          </div>
          <Option6 />
        </div>

        <Separator />

        {/* Option 7 */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">Option 7: Compact Signal Rows</h2>
            <p className="text-sm text-muted-foreground">
              Table-style rows. Most information-dense option.
            </p>
          </div>
          <Option7 />
        </div>
      </div>
    </div>
  );
}
