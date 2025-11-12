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
  Code2,
  ChevronRight,
  User
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Types
type NavItem = {
  title: string;
  url: string;
  icon: typeof Search;
  hidden?: boolean;
};

type NavSection = {
  title: string;
  icon: typeof Search;
  items: NavItem[];
};

// Workflow navigation sections
const workflowSections = [
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
];

// Utility section (Settings)
const settingsSection = {
  title: "Settings",
  icon: Settings,
  items: [
    { title: "Spotify & APIs", url: "/settings/spotify", icon: Sparkles },
    { title: "Database & Storage", url: "/settings/database", icon: Database },
    { title: "User Preferences", url: "/settings/preferences", icon: UserCog },
    { title: "Automation", url: "/settings/automation", icon: Zap },
    { title: "Dev", url: "/settings/dev", icon: Code2, hidden: true },
  ],
};

export function AppSidebar() {
  const [location] = useLocation();

  const renderSection = (section: NavSection) => (
    <Collapsible
      key={section.title}
      asChild
      defaultOpen={section.items.some(subItem => location === subItem.url)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton 
            tooltip={section.title}
            className={cn(
              "hover-elevate group/button",
              "data-[state=open]:bg-primary/10"
            )}
            data-testid={`sidebar-section-${section.title.toLowerCase().replace(/\//g, '-')}`}
          >
            <section.icon className="h-4 w-4" />
            <span>{section.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((subItem) => {
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
  );

  return (
    <Sidebar className="glass-panel border-r border-primary/20 bg-background/95 backdrop-blur-xl" data-testid="app-sidebar">
      <SidebarContent>
        {/* Logo */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold text-primary mb-4 px-2" data-testid="sidebar-logo">
            PubCo Live
          </SidebarGroupLabel>
        </SidebarGroup>

        {/* Workflow Sections */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {workflowSections.map(renderSection)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Spacer to push footer content to bottom */}
        <div className="flex-1" />
      </SidebarContent>

      {/* Footer: User Profile + Settings */}
      <SidebarFooter>
        <SidebarSeparator className="mb-2" />
        
        {/* User Profile Card */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton 
                  className="hover-elevate h-auto py-3"
                  data-testid="sidebar-user-profile"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="" alt="User" />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start gap-0.5 text-left">
                    <span className="text-sm font-medium">A&R Manager</span>
                    <span className="text-xs text-muted-foreground">PubCo Live</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem data-testid="dropdown-account-settings">
                  <UserCog className="h-4 w-4 mr-2" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="dropdown-sign-out">
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Settings Section */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderSection(settingsSection)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
