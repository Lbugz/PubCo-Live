import { 
  Search, 
  List, 
  Users, 
  MessageCircle, 
  Target, 
  Briefcase, 
  FileText, 
  Layout,
  Settings,
  Sparkles,
  Database,
  UserCog,
  Zap,
  Code2
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    title: "Discovery",
    icon: Search,
    items: [
      { title: "Playlists View", url: "/playlists", icon: List },
      { title: "Tracks View", url: "/", icon: Sparkles },
    ],
  },
  {
    title: "Relationships/CRM",
    icon: Users,
    items: [
      { title: "Contacts", url: "/contacts", icon: Users },
      { title: "Engagements", url: "/engagements", icon: MessageCircle },
      { title: "Opportunities", url: "/opportunities", icon: Target },
    ],
  },
  {
    title: "Deals",
    icon: Briefcase,
    items: [
      { title: "Pipeline", url: "/pipeline", icon: Layout },
      { title: "Deal Detail", url: "/deal-detail", icon: FileText },
      { title: "Templates", url: "/deal-templates", icon: FileText },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { title: "Spotify & APIs", url: "/settings/spotify", icon: Sparkles },
      { title: "Database & Storage", url: "/settings/database", icon: Database },
      { title: "User Preferences", url: "/settings/preferences", icon: UserCog },
      { title: "Automation", url: "/settings/automation", icon: Zap },
      { title: "Dev", url: "/settings/dev", icon: Code2, hidden: true },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="glass-panel border-r border-primary/20 bg-background/95 backdrop-blur-xl" data-testid="app-sidebar">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold text-primary mb-4 px-2" data-testid="sidebar-logo">
            PubCo Live
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={item.items.some(subItem => location === subItem.url)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        tooltip={item.title}
                        className={cn(
                          "hover-elevate group/button",
                          "data-[state=open]:bg-primary/10"
                        )}
                        data-testid={`sidebar-section-${item.title.toLowerCase().replace(/\//g, '-')}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((subItem) => {
                          if (subItem.hidden) return null;
                          
                          const isActive = location === subItem.url;
                          
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton 
                                asChild
                                isActive={isActive}
                                className={cn(
                                  "hover-elevate",
                                  isActive && "bg-primary/20 text-primary font-medium"
                                )}
                                data-testid={`sidebar-link-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <Link href={subItem.url}>
                                  <subItem.icon className="h-4 w-4" />
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
