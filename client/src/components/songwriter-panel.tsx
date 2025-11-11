import { useQuery } from "@tanstack/react-query";
import { type Artist } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Instagram, 
  Twitter, 
  Facebook, 
  Linkedin, 
  Youtube, 
  ExternalLink,
  Music2
} from "lucide-react";
import { SiDiscogs, SiBandcamp } from "react-icons/si";
import { useLocation } from "wouter";

interface SongwriterPanelProps {
  trackId: string;
}

export function SongwriterPanel({ trackId }: SongwriterPanelProps) {
  const [, setLocation] = useLocation();
  
  const { data: artists, isLoading } = useQuery<Artist[]>({
    queryKey: ["/api/tracks", trackId, "artists"],
    enabled: !!trackId,
  });

  const handleViewAllTracks = (artistName: string) => {
    const encodedName = encodeURIComponent(artistName);
    setLocation(`/?searchQuery=${encodedName}`);
  };

  const getSocialLinks = (artist: Artist) => {
    const links = [];
    
    if (artist.instagram) {
      links.push({
        name: "Instagram",
        url: artist.instagram,
        icon: Instagram,
        color: "text-pink-600 dark:text-pink-400"
      });
    }
    if (artist.twitter) {
      links.push({
        name: "Twitter",
        url: artist.twitter,
        icon: Twitter,
        color: "text-blue-500 dark:text-blue-400"
      });
    }
    if (artist.facebook) {
      links.push({
        name: "Facebook",
        url: artist.facebook,
        icon: Facebook,
        color: "text-blue-600 dark:text-blue-400"
      });
    }
    if (artist.linkedin) {
      links.push({
        name: "LinkedIn",
        url: artist.linkedin,
        icon: Linkedin,
        color: "text-blue-700 dark:text-blue-500"
      });
    }
    if (artist.youtube) {
      links.push({
        name: "YouTube",
        url: artist.youtube,
        icon: Youtube,
        color: "text-red-600 dark:text-red-400"
      });
    }
    if (artist.discogs) {
      links.push({
        name: "Discogs",
        url: artist.discogs,
        icon: SiDiscogs,
        color: "text-gray-700 dark:text-gray-300"
      });
    }
    if (artist.bandcamp) {
      links.push({
        name: "Bandcamp",
        url: artist.bandcamp,
        icon: SiBandcamp,
        color: "text-cyan-600 dark:text-cyan-400"
      });
    }
    if (artist.website) {
      links.push({
        name: "Website",
        url: artist.website,
        icon: ExternalLink,
        color: "text-gray-600 dark:text-gray-400"
      });
    }
    
    return links;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!artists || artists.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Music2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No songwriter information available yet</p>
        <p className="text-xs mt-1">Enrich this track to discover songwriters and their socials</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {artists.map((artist) => {
        const socialLinks = getSocialLinks(artist);
        
        return (
          <Card key={artist.id} className="p-4 hover-elevate" data-testid={`card-artist-${artist.id}`}>
            <div className="space-y-3">
              {/* Artist Name */}
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold" data-testid={`text-artist-name-${artist.id}`}>
                  {artist.name}
                </h4>
                {artist.musicbrainzId && (
                  <Badge variant="outline" className="text-xs">
                    Verified
                  </Badge>
                )}
              </div>

              {/* Social Links */}
              {socialLinks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => (
                    <Button
                      key={link.name}
                      variant="ghost"
                      size="icon"
                      className={link.color}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(link.url, '_blank', 'noopener,noreferrer');
                      }}
                      data-testid={`link-${link.name.toLowerCase()}-${artist.id}`}
                      title={link.name}
                      aria-label={`${artist.name} on ${link.name}`}
                    >
                      <link.icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  No social links yet
                </Badge>
              )}

              {/* View All Tracks Action */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleViewAllTracks(artist.name)}
                data-testid={`button-view-tracks-${artist.id}`}
              >
                <Music2 className="h-4 w-4" />
                View All Tracks by {artist.name}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
