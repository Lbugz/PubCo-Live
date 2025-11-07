import { useState } from "react";
import { User, Instagram, Twitter, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type PlaylistSnapshot } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrackContactDialogProps {
  track: PlaylistSnapshot;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TrackContactDialog({ track, open: controlledOpen, onOpenChange }: TrackContactDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  
  const [contact, setContact] = useState({
    instagram: track.instagram || "",
    twitter: track.twitter || "",
    tiktok: track.tiktok || "",
    email: track.email || "",
    contactNotes: track.contactNotes || "",
  });

  const hasContact = track.instagram || track.twitter || track.tiktok || track.email || track.contactNotes;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/tracks/${track.id}/contact`, contact);
      
      // Invalidate track queries to refetch updated data
      await queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      
      toast({
        title: "Contact saved",
        description: "Contact information updated successfully",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error saving contact",
        description: "Failed to save contact information",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={hasContact ? "secondary" : "ghost"}
          size="sm"
          className="gap-2"
          data-testid={`button-contact-${track.id}`}
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Contact</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" data-testid={`dialog-contact-${track.id}`}>
        <DialogHeader>
          <DialogTitle>Contact Information</DialogTitle>
          <DialogDescription>
            Add contact details for {track.trackName} by {track.artistName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instagram" className="flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Instagram
            </Label>
            <Input
              id="instagram"
              placeholder="@username or URL"
              value={contact.instagram}
              onChange={(e) => setContact({ ...contact, instagram: e.target.value })}
              data-testid={`input-instagram-${track.id}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="twitter" className="flex items-center gap-2">
              <Twitter className="h-4 w-4" />
              Twitter / X
            </Label>
            <Input
              id="twitter"
              placeholder="@username or URL"
              value={contact.twitter}
              onChange={(e) => setContact({ ...contact, twitter: e.target.value })}
              data-testid={`input-twitter-${track.id}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tiktok" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              TikTok
            </Label>
            <Input
              id="tiktok"
              placeholder="@username or URL"
              value={contact.tiktok}
              onChange={(e) => setContact({ ...contact, tiktok: e.target.value })}
              data-testid={`input-tiktok-${track.id}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="contact@example.com"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              data-testid={`input-email-${track.id}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Outreach notes, talking points, or other information..."
              value={contact.contactNotes}
              onChange={(e) => setContact({ ...contact, contactNotes: e.target.value })}
              rows={4}
              data-testid={`input-notes-${track.id}`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
            data-testid={`button-cancel-contact-${track.id}`}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid={`button-save-contact-${track.id}`}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
