import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsDev() {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">Developer Settings</h1>
        <Badge variant="outline" className="text-xs">Hidden</Badge>
      </div>
      <p className="text-muted-foreground mb-6">
        Advanced developer tools and debugging options
      </p>
      
      <Card className="glass-panel p-6">
        <p className="text-muted-foreground">
          Developer settings placeholder - Coming soon
        </p>
      </Card>
    </div>
  );
}
