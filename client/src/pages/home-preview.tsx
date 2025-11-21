import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  TrendingUp, 
  Users, 
  Music, 
  Target, 
  Activity,
  Sparkles,
  Play,
  Download,
  Search,
  Filter,
  BarChart3,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import type { ContactWithSongwriter } from "@shared/schema";

export default function HomePreview() {
  const [activeTab, setActiveTab] = useState("command-center");

  // Fetch real data
  const { data: contactsResponse } = useQuery<{
    contacts: ContactWithSongwriter[];
    total: number;
    stats?: {
      total: number;
      hotLeads: number;
      discovery: number;
      watch: number;
      search: number;
      unsignedPct: number;
    };
  }>({
    queryKey: ["/api/contacts"],
  });

  const contacts = Array.isArray(contactsResponse?.contacts) ? contactsResponse.contacts : [];
  const stats = contactsResponse?.stats;

  const { data: playlists } = useQuery<any[]>({
    queryKey: ["/api/tracked-playlists"],
  });

  const hotLeads = contacts.filter(c => c.hotLead > 0).slice(0, 8);
  const recentDiscoveries = contacts.slice(0, 20);
  const featuredContact = contacts[0];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Home Page Concepts Preview</h1>
          </div>
          <Badge variant="outline" className="ml-auto">3 Design Options</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b px-6 pt-4">
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="command-center" data-testid="tab-command-center">
                Command Center
              </TabsTrigger>
              <TabsTrigger value="discovery-feed" data-testid="tab-discovery-feed">
                Discovery Feed
              </TabsTrigger>
              <TabsTrigger value="mission-control" data-testid="tab-mission-control">
                Mission Control
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="command-center" className="m-0 h-full">
              <CommandCenterConcept 
                stats={stats} 
                hotLeads={hotLeads} 
                playlists={playlists}
              />
            </TabsContent>

            <TabsContent value="discovery-feed" className="m-0 h-full">
              <DiscoveryFeedConcept 
                featuredContact={featuredContact}
                discoveries={recentDiscoveries}
                stats={stats}
              />
            </TabsContent>

            <TabsContent value="mission-control" className="m-0 h-full">
              <MissionControlConcept 
                stats={stats}
                contacts={contacts || []}
                playlists={playlists}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// Concept 1: Command Center Dashboard
function CommandCenterConcept({ stats, hotLeads, playlists }: any) {
  return (
    <div className="p-6 space-y-6">
      {/* Hero Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="metric-total-contacts">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              Unsigned songwriters tracked
            </p>
          </CardContent>
        </Card>

        <Card data-testid="metric-hot-leads">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hot Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.hotLeads || 0}</div>
            <p className="text-xs text-muted-foreground">
              High-priority targets
            </p>
          </CardContent>
        </Card>

        <Card data-testid="metric-unsigned-pct">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unsigned Rate</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.unsignedPct || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Without major publisher
            </p>
          </CardContent>
        </Card>

        <Card data-testid="metric-this-week">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.discovery || 0}</div>
            <p className="text-xs text-muted-foreground">
              New discoveries
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hot Leads Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                Hot Leads
              </CardTitle>
              <CardDescription>
                Highest-scored unsigned songwriters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {hotLeads.map((contact: ContactWithSongwriter) => (
                  <Card key={contact.id} className="hover-elevate" data-testid={`hot-lead-${contact.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {contact.songwriterName}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {contact.totalTracks} tracks • {contact.totalStreams?.toLocaleString()} streams
                          </CardDescription>
                        </div>
                        <Badge variant="default">{contact.unsignedScore}/11</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">WoW Growth</span>
                        <span className={contact.wowGrowthPct && contact.wowGrowthPct > 0 ? "text-green-600 font-medium" : ""}>
                          {contact.wowGrowthPct ? `+${contact.wowGrowthPct}%` : "—"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed + Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="default" data-testid="button-scan-playlists">
                <Play className="h-4 w-4 mr-2" />
                Run Playlist Scan
              </Button>
              <Button className="w-full justify-start" variant="outline" data-testid="button-review-leads">
                <Target className="h-4 w-4 mr-2" />
                Review Hot Leads
              </Button>
              <Button className="w-full justify-start" variant="outline" data-testid="button-export-report">
                <Download className="h-4 w-4 mr-2" />
                Export Weekly Report
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Activity Feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {playlists?.slice(0, 8).map((playlist: any, idx: number) => (
                    <div key={playlist.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{playlist.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Updated {idx} hours ago
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Concept 2: Discovery Feed
function DiscoveryFeedConcept({ featuredContact, discoveries, stats }: any) {
  return (
    <div className="h-full flex">
      {/* Left Sidebar - Filters */}
      <div className="w-64 border-r p-4 space-y-4">
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </h3>
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="filter-all">
              All Discoveries
              <Badge variant="secondary" className="ml-auto">{discoveries.length}</Badge>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="filter-discovery">
              Discovery Pool
              <Badge variant="secondary" className="ml-auto">{stats?.discovery || 0}</Badge>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="filter-watch">
              Watch List
              <Badge variant="secondary" className="ml-auto">{stats?.watch || 0}</Badge>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="filter-search">
              Active Search
              <Badge variant="secondary" className="ml-auto">{stats?.search || 0}</Badge>
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-2">Score Range</h4>
          <div className="space-y-1">
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
              9-11 points <Badge variant="secondary" className="ml-auto">High</Badge>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
              6-8 points <Badge variant="secondary" className="ml-auto">Med</Badge>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
              0-5 points <Badge variant="secondary" className="ml-auto">Low</Badge>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Feed */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Featured Discovery */}
          {featuredContact && (
            <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge className="mb-2">Featured Discovery</Badge>
                    <CardTitle className="text-2xl">{featuredContact.songwriterName}</CardTitle>
                    <CardDescription className="mt-1">
                      {featuredContact.totalTracks} tracks • {featuredContact.totalStreams?.toLocaleString()} total streams
                    </CardDescription>
                  </div>
                  <Badge variant="default" className="text-lg px-3 py-1">
                    {featuredContact.unsignedScore}/11
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      +{featuredContact.wowGrowthPct || 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">Spotify WoW</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      +{featuredContact.wowYoutubeGrowthPct || 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">YouTube WoW</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {featuredContact.collaborationCount || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Collaborations</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Discovery Stream */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Discoveries</h2>
              <Button variant="outline" size="sm" data-testid="button-load-more">
                Load More
              </Button>
            </div>

            <div className="space-y-3">
              {discoveries.map((contact: ContactWithSongwriter) => (
                <Card key={contact.id} className="hover-elevate" data-testid={`discovery-${contact.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-base">{contact.songwriterName}</CardTitle>
                          <Badge variant="outline" className="text-xs">{contact.stage}</Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {contact.totalTracks} tracks • {contact.totalStreams?.toLocaleString()} streams
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{contact.unsignedScore}/11</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-green-600 font-medium">
                          {contact.wowGrowthPct ? `+${contact.wowGrowthPct}%` : "—"}
                        </span>
                      </div>
                      <Separator orientation="vertical" className="h-4" />
                      <span className="text-muted-foreground">
                        {contact.collaborationCount || 0} collabs
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Stats Panel */}
      <div className="w-80 border-l p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Weekly Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">New Discoveries</span>
              <span className="font-semibold">{stats?.discovery || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hot Leads</span>
              <span className="font-semibold">{stats?.hotLeads || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Unsigned Rate</span>
              <span className="font-semibold">{stats?.unsignedPct || 0}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pipeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discovery Pool</span>
              <Badge variant="secondary">{stats?.discovery || 0}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Watch List</span>
              <Badge variant="secondary">{stats?.watch || 0}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active Search</span>
              <Badge variant="secondary">{stats?.search || 0}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Concept 3: Mission Control
function MissionControlConcept({ stats, contacts, playlists }: any) {
  return (
    <div className="h-full flex flex-col">
      {/* Top Stats Bar */}
      <div className="border-b p-4 bg-muted/20">
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <div className="text-xs text-muted-foreground">Total Contacts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats?.hotLeads || 0}</div>
            <div className="text-xs text-muted-foreground">Hot Leads</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{stats?.unsignedPct || 0}%</div>
            <div className="text-xs text-muted-foreground">Unsigned</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{playlists?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Active Playlists</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{stats?.discovery || 0}</div>
            <div className="text-xs text-muted-foreground">This Week</div>
          </div>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - System Status */}
        <div className="w-80 border-r p-4 space-y-4 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-600" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Scheduler</span>
                </div>
                <Badge variant="outline" className="text-green-600">Active</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Enrichment Worker</span>
                </div>
                <Badge variant="outline" className="text-green-600">Running</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Next Playlist Update</span>
                </div>
                <span className="text-xs text-muted-foreground">Friday 10:00</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Scheduled Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Music className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Playlist Updates</p>
                  <p className="text-xs text-muted-foreground">Fri 10:00-12:00 UTC</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Performance Snapshots</p>
                  <p className="text-xs text-muted-foreground">Thu 11:59 PM EST</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Failed Retry</p>
                  <p className="text-xs text-muted-foreground">Daily 2:00 AM</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Enrichment Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-semibold">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Processing</span>
                  <span className="font-semibold">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed Today</span>
                  <span className="font-semibold text-green-600">0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Interactive Chart & Data */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="space-y-6">
            {/* Chart Placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Unsigned Songwriter Growth Trend</CardTitle>
                <CardDescription>30-day discovery and growth patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-muted/20 rounded-lg">
                  <div className="text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Interactive chart would display here</p>
                    <p className="text-xs">Showing discovery trends, WoW growth, and pipeline movement</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Discoveries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contacts.slice(0, 10).map((contact: ContactWithSongwriter) => (
                    <div 
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-lg hover-elevate border"
                      data-testid={`recent-${contact.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.songwriterName}</p>
                        <p className="text-sm text-muted-foreground">
                          {contact.totalTracks} tracks • {contact.totalStreams?.toLocaleString()} streams
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">{contact.unsignedScore}/11</Badge>
                        <Badge variant="outline" className={contact.wowGrowthPct && contact.wowGrowthPct > 0 ? "text-green-600" : ""}>
                          {contact.wowGrowthPct ? `+${contact.wowGrowthPct}%` : "—"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Bottom Tray - Quick Access */}
      <div className="border-t bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" data-testid="button-mission-scan">
              <Play className="h-3 w-3 mr-1" />
              Scan Playlists
            </Button>
            <Button size="sm" variant="outline" data-testid="button-mission-export">
              <Download className="h-3 w-3 mr-1" />
              Export Data
            </Button>
            <Button size="sm" variant="outline" data-testid="button-mission-search">
              <Search className="h-3 w-3 mr-1" />
              Search Contacts
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Last updated: Just now
          </div>
        </div>
      </div>
    </div>
  );
}
