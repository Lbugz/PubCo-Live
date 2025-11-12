import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Calendar, Clock, Cookie, ExternalLink, AlertTriangle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CookieStatus {
  healthy: boolean;
  lastSuccessfulAuth: string | null;
  lastFailedAuth: string | null;
  consecutiveFailures: number;
  cookieSource: "secret" | "file" | "none";
  cookieExpiry: string | null;
  cookieExpired: boolean | null;
}

interface AuthStatus {
  connected: boolean;
  error?: string;
}

export default function SettingsSpotify() {
  const { data: authStatus, isLoading: authLoading } = useQuery<AuthStatus>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 5000,
  });

  const { data: cookieStatus, isLoading } = useQuery<CookieStatus>({
    queryKey: ["/api/spotify/cookie-status"],
    refetchInterval: 30000,
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getTimeAgo = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return "just now";
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Spotify & APIs</h1>
        <p className="text-muted-foreground">
          Monitor authentication health and manage API integrations
        </p>
      </div>

      {/* Spotify Integration Status */}
      <Card className="glass-panel mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Spotify Integration
              </CardTitle>
              <CardDescription>
                Managed authentication for accessing album artwork and track metadata
              </CardDescription>
            </div>
            {!authLoading && authStatus && (
              <Badge 
                variant={authStatus.connected ? "default" : "outline"}
                className="flex items-center gap-1"
              >
                {authStatus.connected ? (
                  <><CheckCircle2 className="h-3 w-3" /> Connected</>
                ) : (
                  <><AlertCircle className="h-3 w-3" /> Not Connected</>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {authLoading ? (
            <p className="text-muted-foreground">Loading connection status...</p>
          ) : (
            <>
              {!authStatus?.connected ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Spotify Not Connected</AlertTitle>
                  <AlertDescription>
                    {authStatus?.error || 'The Spotify integration is not connected. Please authorize it through the Replit Secrets panel.'}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Spotify Connected</AlertTitle>
                  <AlertDescription>
                    Your Spotify integration is active. Album artwork and track metadata will be automatically fetched when importing playlists.
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm font-semibold mb-2">
                  {authStatus?.connected ? 'How to Use Spotify Features' : 'How to Connect Spotify'}
                </h3>
                {!authStatus?.connected ? (
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Open the Replit <span className="font-medium text-foreground">Secrets</span> panel (Tools → Secrets in the sidebar)</li>
                    <li>Find the <span className="font-medium text-foreground">Spotify</span> integration</li>
                    <li>Click <span className="font-medium text-foreground">"Connect"</span> and authorize with your Spotify account</li>
                    <li>Return to this app - the connection will be automatic</li>
                  </ol>
                ) : (
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Go to <span className="font-medium text-foreground">Playlists View</span> in the sidebar</li>
                    <li>Click <span className="font-medium text-foreground">"Add Playlist"</span> and enter a Spotify playlist URL</li>
                    <li>Click <span className="font-medium text-foreground">"Fetch Data"</span> on the playlist you want to import</li>
                    <li>Album artwork and track metadata will be automatically fetched</li>
                  </ol>
                )}
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Note:</strong> This uses Replit's managed OAuth integration, which automatically handles token refresh and authentication for you.
                  </AlertDescription>
                </Alert>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cookie Health Status */}
      <Card className="glass-panel mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cookie className="h-5 w-5" />
                Cookie Authentication Status
              </CardTitle>
              <CardDescription>
                Track Spotify cookie validity and authentication health
              </CardDescription>
            </div>
            {!isLoading && cookieStatus && (
              <Badge 
                variant={cookieStatus.healthy ? "default" : "destructive"}
                className="flex items-center gap-1"
              >
                {cookieStatus.healthy ? (
                  <><CheckCircle2 className="h-3 w-3" /> Healthy</>
                ) : (
                  <><AlertCircle className="h-3 w-3" /> Unhealthy</>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading cookie status...</p>
          ) : cookieStatus ? (
            <>
              {/* Warning Alert for Unhealthy Status */}
              {!cookieStatus.healthy && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Action Required</AlertTitle>
                  <AlertDescription>
                    {cookieStatus.cookieExpired 
                      ? "Your Spotify cookies have expired. Please refresh them to continue accessing editorial playlists."
                      : cookieStatus.consecutiveFailures > 0
                        ? `${cookieStatus.consecutiveFailures} consecutive authentication failures detected. Your cookies may be invalid.`
                        : "Cookie authentication is unhealthy. Please check your configuration."}
                  </AlertDescription>
                </Alert>
              )}

              {/* Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-white/5 border border-white/10">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">Last Successful Auth</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(cookieStatus.lastSuccessfulAuth)}
                    </p>
                    {cookieStatus.lastSuccessfulAuth && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {getTimeAgo(cookieStatus.lastSuccessfulAuth)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-white/5 border border-white/10">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">Cookie Expiry</p>
                    <p className="text-sm text-muted-foreground">
                      {cookieStatus.cookieExpiry ? formatDate(cookieStatus.cookieExpiry) : "Unknown"}
                    </p>
                    {cookieStatus.cookieExpired !== null && (
                      <Badge 
                        variant={cookieStatus.cookieExpired ? "destructive" : "default"}
                        className="mt-1"
                      >
                        {cookieStatus.cookieExpired ? "Expired" : "Valid"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-white/5 border border-white/10">
                  <Cookie className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">Cookie Source</p>
                    <Badge variant="outline">
                      {cookieStatus.cookieSource === "secret" ? "Replit Secret" : 
                       cookieStatus.cookieSource === "file" ? "Local File" : "None"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg bg-white/5 border border-white/10">
                  <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">Consecutive Failures</p>
                    <p className="text-sm text-muted-foreground">
                      {cookieStatus.consecutiveFailures} failures
                    </p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm font-semibold mb-2">How to Refresh Cookies</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Run the cookie capture script on your local machine: <code className="bg-white/5 px-1 rounded">node spotify-auth-export.js</code></li>
                  <li>Log into your Spotify account in the browser window that opens</li>
                  <li>Press ENTER in the terminal after logging in</li>
                  <li>Copy the contents of <code className="bg-white/5 px-1 rounded">spotify-cookies.json</code></li>
                  <li>Update the <code className="bg-white/5 px-1 rounded">SPOTIFY_COOKIES_JSON</code> secret in Replit</li>
                  <li>Restart the application</li>
                </ol>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  asChild
                >
                  <a 
                    href="/COOKIE_SETUP.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Detailed Setup Guide
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Unable to load cookie status</p>
          )}
        </CardContent>
      </Card>

      {/* Additional API Settings Placeholder */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Other API Integrations</CardTitle>
          <CardDescription>
            Configure additional API services (Coming soon)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            MusicBrainz, OpenAI, and other API configurations will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
