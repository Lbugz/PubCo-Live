import { DetailDrawerHeader, StatsGrid, ActionRail, EnrichmentTimeline, PersonList, DrawerSection } from "@/components/details/detail-primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Check, Download, Mail, MessageCircle, Share2, Sparkles, Star, Users, Play, ExternalLink, FileText, UserPlus, TrendingUp, ListMusic } from "lucide-react";
import type { ReactNode } from "react";

interface DrawerPreviewProps {
  title: string;
  children: ReactNode;
}

function DrawerPreview({ title, children }: DrawerPreviewProps) {
  return (
    <Card className="border border-border/70 bg-background/60 shadow-xl shadow-primary/5">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preview</p>
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          </div>
          <Badge variant="outline" className="rounded-full border-primary/40 bg-primary/10 text-primary">
            Unified layout demo
          </Badge>
        </div>
        <div className="space-y-6">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function DetailPreviewPage() {
  return (
    <div className="container mx-auto space-y-8 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="rounded-full bg-primary/10 text-primary" variant="outline">
            Detail Drawers
          </Badge>
          <Badge className="rounded-full" variant="secondary">
            Shared primitives
          </Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Playlist · Track · Contact detail drawers</h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          This preview uses shared header, stats, action rail, and activity timeline primitives so every drawer feels cohesive.
          Swap in real data later without touching layout or typography.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DrawerPreview title="Playlist detail drawer">
          <DetailDrawerHeader
            title="Fresh Finds: Hyperpop"
            subtitle="Editorial Playlist"
            description="Curated by Spotify · 220K followers"
            badges={[
              { label: "High impact", variant: "high" },
              { label: "Active fetch", variant: "medium" },
            ]}
            imageUrl="https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=600&q=80"
            fallback="FF"
            meta={[
              { label: "Last updated", value: "2h ago" },
              { label: "Tracks enriched", value: "86%" },
            ]}
          />
          <StatsGrid
            stats={[
              { label: "Total tracks", value: "125", helper: "+12 this week" },
              { label: "Unsigned writers", value: "42", helper: "-5 vs last pull" },
              { label: "Enrichment score", value: "92", helper: "Top tier" },
              { label: "Chartmetric linked", value: "88%", helper: "+8 pts" },
            ]}
          />
          <ActionRail
            primaryAction={{ label: "Fetch fresh tracks", icon: Sparkles }}
            secondaryActions={[
              { label: "View track list", icon: ListMusic },
              { label: "Export CSV", icon: Download, subtle: true },
            ]}
          />
          <DrawerSection title="Metadata & Ownership">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Fetch cadence</p>
                <p className="font-medium text-foreground">Weekly · Fridays</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Curator</p>
                <p className="font-medium text-foreground">Spotify Editorial</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Source</p>
                <p className="font-medium text-foreground">Web scrape</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Completeness</p>
                <p className="font-medium text-foreground">125 / 130 tracks</p>
              </div>
            </div>
          </DrawerSection>
          <EnrichmentTimeline
            steps={[
              {
                label: "Spotify scrape",
                description: "Last completed 2 hours ago",
                status: "done",
                timestamp: "12:14 PM · Nov 24",
              },
              {
                label: "Chartmetric sync",
                description: "Queued for midnight batch",
                status: "active",
                timestamp: "Runs daily",
              },
              {
                label: "A&R notes",
                description: "Awaiting curator confirmation",
                status: "pending",
              },
            ]}
          />
        </DrawerPreview>

        <DrawerPreview title="Track detail drawer">
          <DetailDrawerHeader
            title="Neon Confessions"
            subtitle="Track · Unsigned"
            description="SLY ft. Liv Rae"
            badges={[
              { label: "Hot lead", variant: "medium" },
              { label: "High velocity", variant: "high" },
            ]}
            imageUrl="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80"
            fallback="NC"
            meta={[
              { label: "ISRC", value: "US-3TZ-24-10032" },
              { label: "First seen", value: "Nov 12" },
            ]}
          />
          <StatsGrid
            stats={[
              { label: "Unsigned score", value: "98", helper: "+6 this week" },
              { label: "Playlists", value: "7", helper: "3 editorial" },
              { label: "Streams", value: "1.2M", helper: "+14% WoW" },
              { label: "Contacts", value: "3", helper: "Writers verified" },
            ]}
          />
          <ActionRail
            primaryAction={{ label: "Enrich track", icon: Sparkles }}
            secondaryActions={[
              { label: "Open in Spotify", icon: ExternalLink },
              { label: "Add note", icon: FileText, subtle: true },
            ]}
          />
          <DrawerSection title="Credits & collaborators">
            <PersonList
              people={[
                { name: "Liv Rae", role: "Songwriter · Vocal", badge: "Unsigned" },
                { name: "K. Nova", role: "Producer", badge: "Verified" },
                { name: "Atlas & Co.", role: "Publisher", badge: "Pending" },
              ]}
            />
          </DrawerSection>
          <DrawerSection title="Status">
            <div className="space-y-2 rounded-2xl border border-border/80 bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Deal readiness</span>
                <Badge className="rounded-full bg-emerald-500/10 text-emerald-300" variant="outline">
                  Greenlight
                </Badge>
              </div>
              <div className="my-2 h-px bg-border" />
              <p className="text-muted-foreground">
                Strong TikTok momentum and playlist velocity. Prioritized for Q1 scouting trip.
              </p>
            </div>
          </DrawerSection>
          <EnrichmentTimeline
            steps={[
              {
                label: "Credits enrichment",
                description: "Spotify + MLC matched",
                status: "done",
                timestamp: "Nov 22 · 09:14 AM",
              },
              {
                label: "Contact verification",
                description: "Waiting on Liv Rae reply",
                status: "active",
                timestamp: "DM sent yesterday",
              },
              {
                label: "Chartmetric sync",
                description: "Scheduled",
                status: "pending",
              },
            ]}
          />
        </DrawerPreview>

        <DrawerPreview title="Contact detail drawer">
          <DetailDrawerHeader
            title="Serena Holt"
            subtitle="Songwriter · Hot lead"
            description="Los Angeles · Writer & topliner"
            badges={[
              { label: "High intent", variant: "high" },
              { label: "Watchlist", variant: "default" },
            ]}
            imageUrl="https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=600&q=80"
            fallback="SH"
            meta={[
              { label: "Stage", value: "Discovery" },
              { label: "Last touch", value: "3 days ago" },
            ]}
          />
          <StatsGrid
            stats={[
              { label: "Tracks linked", value: "5", helper: "2 unsigned" },
              { label: "Engagement", value: "82%", helper: "Opens every recap" },
              { label: "Introductions", value: "3", helper: "A&R team" },
              { label: "Follow-ups", value: "Due Fri" },
            ]}
          />
          <ActionRail
            primaryAction={{ label: "Send outreach", icon: Mail }}
            secondaryActions={[
              { label: "Add note", icon: FileText },
              { label: "Update stage", icon: TrendingUp, subtle: true },
            ]}
          />
          <DrawerSection title="Contact info">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <a href="mailto:serena@midnightridge.com" className="text-sm font-medium text-primary hover:underline">
                  serena@midnightridge.com
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Instagram</span>
                <a href="https://instagram.com/serenawrites" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
                  @serenawrites
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Location</span>
                <p className="font-medium text-foreground">LA · Often in Nashville</p>
              </div>
            </div>
          </DrawerSection>
          <DrawerSection title="Notes">
            <ScrollArea className="h-32 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
              <p className="text-muted-foreground">
                Loved the Fresh Finds placement and wants to co-write during LA trip (Dec 10–12). Prefers sync-first
                opportunities and sent 3 unreleased demos for review.
              </p>
            </ScrollArea>
          </DrawerSection>
          <EnrichmentTimeline
            steps={[
              {
                label: "Intro call",
                description: "Met during NY writers camp",
                status: "done",
                timestamp: "Oct 03 · 2:00 PM",
              },
              {
                label: "Re-enrich socials",
                description: "Waiting on IG confirmation",
                status: "active",
                timestamp: "Reminder set for Friday",
              },
              {
                label: "Send songwriting pack",
                description: "Not started",
                status: "pending",
              },
            ]}
          />
        </DrawerPreview>
      </div>
    </div>
  );
}
