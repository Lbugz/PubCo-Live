import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAINarrativeMode } from "@/lib/commentarySettings";
import { Sparkles, FileText, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function SettingsScoring() {
  const { aiNarrativeMode, toggleAINarrative } = useAINarrativeMode();

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Scoring & Narrative</h1>
        <p className="text-muted-foreground">
          Configure how scoring commentary is generated and displayed
        </p>
      </div>

      {/* AI Narrative Mode Card */}
      <Card className="glass-panel mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Narrative Mode
              </CardTitle>
              <CardDescription className="mt-1.5">
                Generate dynamic commentary using AI or use deterministic rules
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-4 rounded-lg border border-border p-4 hover-elevate transition-colors">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {aiNarrativeMode ? (
                  <Sparkles className="h-4 w-4 text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <Label htmlFor="ai-narrative-mode" className="font-medium cursor-pointer">
                  {aiNarrativeMode ? "AI-Powered Commentary" : "Rules-Based Commentary"}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                {aiNarrativeMode
                  ? "Using OpenAI to generate context-aware, dynamic commentary"
                  : "Using deterministic rules for consistent, fast commentary"}
              </p>
            </div>
            <Switch
              id="ai-narrative-mode"
              checked={aiNarrativeMode}
              onCheckedChange={toggleAINarrative}
              data-testid="switch-ai-narrative-mode"
            />
          </div>

          {/* Information Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>How It Works</AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {aiNarrativeMode ? "AI-Powered Mode (Enabled):" : "Rules-Based Mode (Enabled):"}
                </p>
                <ul className="text-sm space-y-1 ml-4 list-disc">
                  {aiNarrativeMode ? (
                    <>
                      <li>Generates unique, context-aware commentary for each contact</li>
                      <li>Adapts tone and insights based on scoring patterns</li>
                      <li>Provides more nuanced opportunity assessments</li>
                      <li>May take slightly longer to load (~1-2 seconds)</li>
                    </>
                  ) : (
                    <>
                      <li>Uses pre-defined A&R-style templates</li>
                      <li>Instant generation with zero latency</li>
                      <li>Consistent, punchy language across all contacts</li>
                      <li>No API costs or external dependencies</li>
                    </>
                  )}
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          {/* Preview Examples */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-medium">Example Commentary Styles</h4>
            <div className="grid gap-3">
              {/* Rules-Based Example */}
              <div className={`rounded-lg border ${!aiNarrativeMode ? 'border-primary bg-primary/5' : 'border-border'} p-3 space-y-2`}>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Rules-Based</span>
                </div>
                <p className="text-sm">
                  "🎯 Wide-open publishing lane — no songs are currently represented. Maximum ownership opportunity."
                </p>
                <p className="text-xs text-muted-foreground">
                  Fast, deterministic, A&R-focused templates
                </p>
              </div>

              {/* AI-Powered Example */}
              <div className={`rounded-lg border ${aiNarrativeMode ? 'border-primary bg-primary/5' : 'border-border'} p-3 space-y-2`}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-primary">AI-Powered</span>
                </div>
                <p className="text-sm">
                  "Clear unsigned opportunity with fully independent distribution and no existing publisher relationships across the catalog—strong outreach candidate."
                </p>
                <p className="text-xs text-muted-foreground">
                  Context-aware, dynamic generation via OpenAI
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Future Settings Placeholder */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Additional Scoring Settings</CardTitle>
          <CardDescription>More configuration options coming soon</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
              <Label className="text-sm">Custom Score Weights</Label>
              <Switch disabled />
            </div>
            <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
              <Label className="text-sm">Auto-Refresh Scoring</Label>
              <Switch disabled />
            </div>
            <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
              <Label className="text-sm">Export Commentary Templates</Label>
              <Switch disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
