import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PLAYLIST_METRICS,
  TRACK_METRICS,
  CONTACT_METRICS,
  DEFAULT_METRIC_PREFERENCES,
  STORAGE_KEY,
  type DashboardMetricPreferences,
  type MetricDefinition,
} from "@shared/metricDefinitions";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPreferences() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<DashboardMetricPreferences>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_METRIC_PREFERENCES;
      }
    }
    return DEFAULT_METRIC_PREFERENCES;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const handleMetricToggle = (
    section: 'playlists' | 'tracks' | 'contacts',
    metricId: string,
    checked: boolean
  ) => {
    const currentSelections = [...preferences[section]];
    
    if (checked) {
      if (currentSelections.length >= 3) {
        toast({
          title: "Maximum reached",
          description: "You can only select 3 metrics per section. Deselect one first.",
          variant: "destructive",
        });
        return;
      }
      currentSelections.push(metricId);
    } else {
      const index = currentSelections.indexOf(metricId);
      if (index > -1) {
        currentSelections.splice(index, 1);
      }
    }

    setPreferences({
      ...preferences,
      [section]: currentSelections as [string, string, string],
    });

    if (checked) {
      toast({
        title: "Metric added",
        description: `Position ${currentSelections.length} updated`,
      });
    } else {
      toast({
        title: "Metric removed",
        description: "Selection updated",
      });
    }
  };

  const getPosition = (section: 'playlists' | 'tracks' | 'contacts', metricId: string) => {
    const index = preferences[section].indexOf(metricId);
    return index >= 0 ? index + 1 : null;
  };

  const renderMetricSection = (
    title: string,
    icon: string,
    metrics: MetricDefinition[],
    section: 'playlists' | 'tracks' | 'contacts'
  ) => {
    return (
      <Card className="glass-panel backdrop-blur-xl border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span>{icon}</span>
            <span>{title}</span>
            <Badge variant="secondary" className="ml-auto">
              {preferences[section].filter(Boolean).length} / 3 selected
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which metrics appear in positions 1, 2, and 3 on your dashboard
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.map((metric) => {
              const isSelected = preferences[section].includes(metric.id);
              const position = getPosition(section, metric.id);

              return (
                <div
                  key={metric.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-background/40 border-border hover-elevate'
                  }`}
                  data-testid={`metric-card-${metric.id}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      handleMetricToggle(section, metric.id, checked as boolean)
                    }
                    data-testid={`checkbox-${metric.id}`}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{metric.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{metric.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {metric.description}
                    </p>
                  </div>

                  {position && (
                    <Badge
                      variant="default"
                      className="shrink-0 min-w-[2rem] justify-center"
                      data-testid={`badge-position-${position}`}
                    >
                      #{position}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Preferences</h1>
          <p className="text-muted-foreground">
            Choose which 3 metrics appear in each section on your dashboard. 
            Changes save automatically.
          </p>
        </div>

        <div className="space-y-6">
          {renderMetricSection("Playlist Metrics", "📋", PLAYLIST_METRICS, "playlists")}
          {renderMetricSection("Track Metrics", "🎵", TRACK_METRICS, "tracks")}
          {renderMetricSection("Contact Metrics", "👤", CONTACT_METRICS, "contacts")}
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Auto-save enabled</p>
                <p className="text-xs text-muted-foreground">
                  Your selections are saved automatically and will appear on your dashboard immediately.
                  Select up to 3 metrics per section to customize your view.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
