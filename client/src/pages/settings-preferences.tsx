import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getMetricPreferences,
  saveMetricPreferences,
  type MetricPreferences,
  type TrackMetricId,
  type PublishingMetricId,
  TRACK_METRIC_OPTIONS,
  PUBLISHING_METRIC_OPTIONS,
} from "@/lib/metricPreferences";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPreferences() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<MetricPreferences>(getMetricPreferences());

  useEffect(() => {
    setPreferences(getMetricPreferences());
  }, []);

  const handleTrackMetricChange = (position: 0 | 1 | 2, value: string) => {
    const newValue = value === 'none' ? null : (value as TrackMetricId);
    
    setPreferences((prev) => {
      const newMetrics: [TrackMetricId | null, TrackMetricId | null, TrackMetricId | null] = [...prev.trackMetrics];
      newMetrics[position] = newValue;

      const newPreferences = {
        ...prev,
        trackMetrics: newMetrics,
      };

      saveMetricPreferences(newPreferences);
      
      toast({
        title: "Metric updated",
        description: `Position ${position + 1} updated`,
      });

      return newPreferences;
    });
  };

  const handlePublishingMetricChange = (position: 0 | 1 | 2, value: string) => {
    const newValue = value === 'none' ? null : (value as PublishingMetricId);
    
    setPreferences((prev) => {
      const newMetrics: [PublishingMetricId | null, PublishingMetricId | null, PublishingMetricId | null] = [...prev.publishingIntelligence];
      newMetrics[position] = newValue;

      const newPreferences = {
        ...prev,
        publishingIntelligence: newMetrics,
      };

      saveMetricPreferences(newPreferences);
      
      toast({
        title: "Metric updated",
        description: `Position ${position + 1} updated`,
      });

      return newPreferences;
    });
  };

  const getAvailableTrackMetrics = (currentPosition: number) => {
    const selectedInOtherPositions = preferences.trackMetrics
      .filter((_, idx) => idx !== currentPosition)
      .filter((m): m is TrackMetricId => m !== null);
    
    return TRACK_METRIC_OPTIONS.filter(
      option => !selectedInOtherPositions.includes(option.id as TrackMetricId)
    );
  };

  const getAvailablePublishingMetrics = (currentPosition: number) => {
    const selectedInOtherPositions = preferences.publishingIntelligence
      .filter((_, idx) => idx !== currentPosition)
      .filter((m): m is PublishingMetricId => m !== null);
    
    return PUBLISHING_METRIC_OPTIONS.filter(
      option => !selectedInOtherPositions.includes(option.id as PublishingMetricId)
    );
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dashboard Preferences</h1>
        <p className="text-muted-foreground">
          Choose which 3 metrics appear on your dashboard and in what order
        </p>
      </div>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Select a metric for each of the 3 positions. You can choose from 6 available options per section. Changes save automatically.
        </AlertDescription>
      </Alert>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Track Metrics</CardTitle>
          <CardDescription>
            Choose which track metrics appear in positions 1, 2, and 3 on your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[0, 1, 2].map((position) => (
            <div key={position} className="space-y-2">
              <Label htmlFor={`track-metric-${position}`} className="text-sm font-medium">
                Position {position + 1}
              </Label>
              <Select
                value={preferences.trackMetrics[position] || 'none'}
                onValueChange={(value) => handleTrackMetricChange(position as 0 | 1 | 2, value)}
              >
                <SelectTrigger 
                  id={`track-metric-${position}`}
                  data-testid={`select-track-metric-${position}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Select a metric..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (hide this position)</SelectItem>
                  <Separator className="my-1" />
                  {getAvailableTrackMetrics(position).map((option) => (
                    <SelectItem 
                      key={option.id} 
                      value={option.id}
                      data-testid={`option-${option.id}`}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Publishing Intelligence</CardTitle>
            <Badge variant="outline" className="text-xs">Experimental</Badge>
          </div>
          <CardDescription>
            Choose which publishing intelligence metrics appear in positions 1, 2, and 3 on your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[0, 1, 2].map((position) => (
            <div key={position} className="space-y-2">
              <Label htmlFor={`publishing-metric-${position}`} className="text-sm font-medium">
                Position {position + 1}
              </Label>
              <Select
                value={preferences.publishingIntelligence[position] || 'none'}
                onValueChange={(value) => handlePublishingMetricChange(position as 0 | 1 | 2, value)}
              >
                <SelectTrigger 
                  id={`publishing-metric-${position}`}
                  data-testid={`select-publishing-metric-${position}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Select a metric..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (hide this position)</SelectItem>
                  <Separator className="my-1" />
                  {getAvailablePublishingMetrics(position).map((option) => (
                    <SelectItem 
                      key={option.id} 
                      value={option.id}
                      data-testid={`option-${option.id}`}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
