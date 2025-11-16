import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Target, Activity, Sparkles, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getMetricPreferences,
  saveMetricPreferences,
  type MetricId,
  type MetricPreferences,
} from "@/lib/metricPreferences";
import { useToast } from "@/hooks/use-toast";

interface MetricOption {
  id: MetricId;
  label: string;
  description: string;
  icon: typeof Target;
}

const TRACK_METRICS: MetricOption[] = [
  {
    id: 'deal-ready-tracks',
    label: 'Deal-Ready Tracks',
    description: 'Tracks with unsigned score 7-10 - strong publishing signals',
    icon: Target,
  },
  {
    id: 'avg-unsigned-score',
    label: 'Avg Unsigned Score',
    description: 'Average unsigned score (0-10) across all tracks',
    icon: Activity,
  },
  {
    id: 'missing-publisher',
    label: 'Missing Publisher',
    description: 'Tracks with no publisher data - strongest unsigned signal (+5 points)',
    icon: Sparkles,
  },
];

const PUBLISHING_INTELLIGENCE_METRICS: MetricOption[] = [
  {
    id: 'high-confidence-unsigned',
    label: 'High-Confidence Unsigned',
    description: 'Songwriters verified as unsigned through MLC search with high-quality scores (7-10)',
    icon: Target,
  },
  {
    id: 'publishing-opportunities',
    label: 'Publishing Opportunities',
    description: 'All songwriter publishing opportunities: MLC verified unsigned',
    icon: Sparkles,
  },
  {
    id: 'enrichment-backlog',
    label: 'Enrichment Backlog',
    description: 'Songwriters not yet searched in MLC',
    icon: Activity,
  },
];

export default function SettingsPreferences() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<MetricPreferences>(getMetricPreferences());

  useEffect(() => {
    setPreferences(getMetricPreferences());
  }, []);

  const toggleMetric = (metricId: MetricId, section: 'trackMetrics' | 'publishingIntelligence') => {
    setPreferences((prev) => {
      const currentList = prev[section];
      const isEnabled = currentList.includes(metricId);
      
      if (isEnabled && currentList.length === 1) {
        toast({
          title: "Cannot disable",
          description: "At least one metric must be enabled in each section",
          variant: "destructive",
        });
        return prev;
      }

      if (!isEnabled && currentList.length >= 3) {
        toast({
          title: "Maximum reached",
          description: "You can select up to 3 metrics per section",
          variant: "destructive",
        });
        return prev;
      }

      const newList = isEnabled
        ? currentList.filter((id) => id !== metricId)
        : [...currentList, metricId];

      const newPreferences = {
        ...prev,
        [section]: newList,
      };

      saveMetricPreferences(newPreferences);

      toast({
        title: isEnabled ? "Metric hidden" : "Metric shown",
        description: `${metricId} ${isEnabled ? 'removed from' : 'added to'} dashboard`,
      });

      return newPreferences;
    });
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dashboard Preferences</h1>
        <p className="text-muted-foreground">
          Customize which metrics appear on your dashboard
        </p>
      </div>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Select up to 3 metrics per section. Changes are saved automatically and appear on the dashboard immediately.
        </AlertDescription>
      </Alert>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Track Metrics</CardTitle>
          <CardDescription>
            Metrics based on track-level enrichment data and scoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Selected: {preferences.trackMetrics.length}/3
            </span>
          </div>
          <Separator />
          {TRACK_METRICS.map((metric) => {
            const isEnabled = preferences.trackMetrics.includes(metric.id);
            const Icon = metric.icon;
            
            return (
              <div
                key={metric.id}
                className="flex items-start space-x-3 p-3 rounded-md hover-elevate transition-colors"
              >
                <Checkbox
                  id={metric.id}
                  checked={isEnabled}
                  onCheckedChange={() => toggleMetric(metric.id, 'trackMetrics')}
                  data-testid={`checkbox-${metric.id}`}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Label
                      htmlFor={metric.id}
                      className="font-medium cursor-pointer"
                    >
                      {metric.label}
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {metric.description}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Publishing Intelligence</CardTitle>
            <Badge variant="outline" className="text-xs">Experimental</Badge>
          </div>
          <CardDescription>
            Contact-level metrics based on MLC/MusicBrainz enrichment verification. Currently being tested while MLC API issues are resolved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Selected: {preferences.publishingIntelligence.length}/3
            </span>
          </div>
          <Separator />
          {PUBLISHING_INTELLIGENCE_METRICS.map((metric) => {
            const isEnabled = preferences.publishingIntelligence.includes(metric.id);
            const Icon = metric.icon;
            
            return (
              <div
                key={metric.id}
                className="flex items-start space-x-3 p-3 rounded-md hover-elevate transition-colors"
              >
                <Checkbox
                  id={metric.id}
                  checked={isEnabled}
                  onCheckedChange={() => toggleMetric(metric.id, 'publishingIntelligence')}
                  data-testid={`checkbox-${metric.id}`}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Label
                      htmlFor={metric.id}
                      className="font-medium cursor-pointer"
                    >
                      {metric.label}
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {metric.description}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
