import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Music2, TrendingUp, TrendingDown, Minus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ThemeToggle } from "@/components/theme-toggle";
import { type PlaylistSnapshot } from "@shared/schema";
import { Link } from "wouter";

export default function Comparison() {
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);

  const { data: weeks = [], isLoading: weeksLoading } = useQuery<string[]>({
    queryKey: ["/api/weeks"],
  });

  const { data: allTracksData = [] } = useQuery<PlaylistSnapshot[][]>({
    queryKey: ["/api/comparison", ...selectedWeeks],
    queryFn: async () => {
      if (selectedWeeks.length === 0) return [];
      const promises = selectedWeeks.map(async (week) => {
        const response = await fetch(`/api/tracks?week=${week}`);
        if (!response.ok) throw new Error(`Failed to fetch tracks for week ${week}`);
        return response.json();
      });
      return Promise.all(promises);
    },
    enabled: selectedWeeks.length > 0,
  });

  const toggleWeek = (week: string) => {
    if (selectedWeeks.includes(week)) {
      setSelectedWeeks(selectedWeeks.filter(w => w !== week));
    } else {
      setSelectedWeeks([...selectedWeeks, week].sort().reverse());
    }
  };

  const getTrackComparison = () => {
    if (selectedWeeks.length < 2 || allTracksData.length < 2) return [];

    const tracksByISRC = new Map<string, Map<string, PlaylistSnapshot>>();

    allTracksData.forEach((weekTracks, index) => {
      const week = selectedWeeks[index];
      weekTracks.forEach((track) => {
        if (!track.isrc) return;
        if (!tracksByISRC.has(track.isrc)) {
          tracksByISRC.set(track.isrc, new Map());
        }
        tracksByISRC.get(track.isrc)!.set(week, track);
      });
    });

    const comparisons: Array<{
      isrc: string;
      trackName: string;
      artistName: string;
      weekData: Map<string, PlaylistSnapshot>;
      scoreChange: number;
      trend: "up" | "down" | "stable" | "new";
    }> = [];

    tracksByISRC.forEach((weekData, isrc) => {
      if (weekData.size < 2) return;

      const sortedWeeks = [...selectedWeeks].sort();
      const oldestWeek = sortedWeeks[0];
      const newestWeek = sortedWeeks[sortedWeeks.length - 1];
      
      const oldestScore = weekData.get(oldestWeek)?.unsignedScore;
      const newestScore = weekData.get(newestWeek)?.unsignedScore;

      if (oldestScore === undefined || newestScore === undefined) return;

      const scoreChange = newestScore - oldestScore;
      let trend: "up" | "down" | "stable" | "new" = "stable";
      if (Math.abs(scoreChange) > 1) {
        trend = scoreChange > 0 ? "up" : "down";
      }

      const firstTrack = Array.from(weekData.values())[0];
      comparisons.push({
        isrc,
        trackName: firstTrack.trackName,
        artistName: firstTrack.artistName,
        weekData,
        scoreChange,
        trend,
      });
    });

    return comparisons.sort((a, b) => Math.abs(b.scoreChange) - Math.abs(a.scoreChange));
  };

  const trackComparisons = getTrackComparison();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Music2 className="h-7 w-7 text-primary" data-testid="icon-logo" />
              <h1 className="text-xl font-bold" data-testid="text-comparison-title">Week Comparison</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" asChild data-testid="button-back-to-dashboard">
                <Link href="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Dashboard
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Select Weeks to Compare</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {weeksLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))
              ) : (
                weeks.map((week) => (
                  <div
                    key={week}
                    className="flex items-center space-x-2 p-3 border rounded-md hover-elevate"
                    data-testid={`checkbox-week-${week}`}
                  >
                    <Checkbox
                      checked={selectedWeeks.includes(week)}
                      onCheckedChange={() => toggleWeek(week)}
                    />
                    <label
                      className="text-sm font-medium cursor-pointer"
                      onClick={() => toggleWeek(week)}
                    >
                      {week}
                    </label>
                  </div>
                ))
              )}
            </div>
            {selectedWeeks.length > 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                Selected {selectedWeeks.length} week{selectedWeeks.length !== 1 ? "s" : ""}
              </p>
            )}
          </Card>

          {selectedWeeks.length < 2 ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select at least 2 weeks</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Choose two or more weeks above to compare track progression and identify trends.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Tracks Compared</p>
                    <p className="text-3xl font-bold" data-testid="stat-tracks-compared">
                      {trackComparisons.length}
                    </p>
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Trending Up</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="stat-trending-up">
                      {trackComparisons.filter(t => t.trend === "up").length}
                    </p>
                  </div>
                </Card>
                <Card className="p-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Trending Down</p>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400" data-testid="stat-trending-down">
                      {trackComparisons.filter(t => t.trend === "down").length}
                    </p>
                  </div>
                </Card>
              </div>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Track Progression</h2>
                <div className="space-y-3">
                  {trackComparisons.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tracks found across selected weeks
                    </p>
                  ) : (
                    trackComparisons.map((comparison) => (
                      <Card key={comparison.isrc} className="p-4 hover-elevate" data-testid={`comparison-track-${comparison.isrc}`}>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                          <div className="lg:col-span-3">
                            <div className="font-medium">{comparison.trackName}</div>
                            <div className="text-sm text-muted-foreground">{comparison.artistName}</div>
                          </div>

                          <div className="lg:col-span-6 flex items-center gap-2 overflow-x-auto">
                            {selectedWeeks.map((week) => {
                              const track = comparison.weekData.get(week);
                              return (
                                <div key={week} className="flex flex-col items-center min-w-[60px]">
                                  <div className="text-xs text-muted-foreground mb-1">{week.slice(-5)}</div>
                                  {track ? (
                                    <Badge
                                      variant={track.unsignedScore >= 7 ? "default" : track.unsignedScore >= 4 ? "secondary" : "outline"}
                                      className="font-semibold"
                                    >
                                      {track.unsignedScore}
                                    </Badge>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">-</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="lg:col-span-3 flex items-center gap-3 justify-end">
                            {comparison.trend === "up" && (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <TrendingUp className="h-4 w-4" />
                                <span className="text-sm font-medium">+{comparison.scoreChange.toFixed(1)}</span>
                              </div>
                            )}
                            {comparison.trend === "down" && (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <TrendingDown className="h-4 w-4" />
                                <span className="text-sm font-medium">{comparison.scoreChange.toFixed(1)}</span>
                              </div>
                            )}
                            {comparison.trend === "stable" && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Minus className="h-4 w-4" />
                                <span className="text-sm font-medium">Stable</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
