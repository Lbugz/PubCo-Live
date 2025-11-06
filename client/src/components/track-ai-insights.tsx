import { useState } from "react";
import { Sparkles, Loader2, Lightbulb, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { type PlaylistSnapshot } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AIInsights {
  summary: string;
  outreachSuggestion: string;
  talkingPoints: string[];
  scoringRationale: string;
  priorityLevel: "high" | "medium" | "low";
}

interface TrackAIInsightsProps {
  track: PlaylistSnapshot;
}

export function TrackAIInsights({ track }: TrackAIInsightsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await apiRequest("POST", `/api/tracks/${track.id}/ai-insights`, {});
      setInsights(result as unknown as AIInsights);
    } catch (error) {
      toast({
        title: "Error generating insights",
        description: "Failed to generate AI insights. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-chart-2 text-white border-chart-2";
      case "medium":
        return "bg-chart-4 text-white border-chart-4";
      case "low":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={handleGenerate}
          data-testid={`button-ai-insights-${track.id}`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI Insights</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid={`dialog-ai-insights-${track.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-chart-2" />
            AI Lead Analysis
          </DialogTitle>
          <DialogDescription>
            {track.trackName} by {track.artistName}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-chart-2" />
            <p className="text-sm text-muted-foreground">Analyzing track data...</p>
          </div>
        )}

        {!loading && insights && (
          <div className="space-y-6 py-4">
            <div className="flex items-center gap-2">
              <Badge className={getPriorityColor(insights.priorityLevel)} data-testid={`badge-priority-${track.id}`}>
                {insights.priorityLevel.toUpperCase()} PRIORITY
              </Badge>
              <span className="text-sm text-muted-foreground">
                Score: {track.unsignedScore}/10
              </span>
            </div>

            <Card className="p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-chart-2 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Summary</h3>
                  <p className="text-sm leading-relaxed" data-testid={`text-summary-${track.id}`}>
                    {insights.summary}
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-chart-4" />
                <h3 className="font-semibold text-sm">Outreach Strategy</h3>
              </div>
              <Card className="p-4">
                <p className="text-sm leading-relaxed" data-testid={`text-outreach-${track.id}`}>
                  {insights.outreachSuggestion}
                </p>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-chart-3" />
                <h3 className="font-semibold text-sm">Key Talking Points</h3>
              </div>
              <ul className="space-y-2">
                {insights.talkingPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-chart-3 mt-1.5 flex-shrink-0">•</span>
                    <span className="text-sm" data-testid={`text-talking-point-${track.id}-${idx}`}>
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Scoring Rationale
              </h4>
              <p className="text-sm text-muted-foreground" data-testid={`text-rationale-${track.id}`}>
                {insights.scoringRationale}
              </p>
            </div>
          </div>
        )}

        {!loading && !insights && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Sparkles className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click the button above to generate AI insights
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
