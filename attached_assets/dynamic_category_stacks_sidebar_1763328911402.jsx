import React, { useState } from "react";
import { ChevronRight, Layers, Users, Handshake, Music2, Disc } from "lucide-react";

export default function DynamicCategoryStacksSidebar() {
  return (
    <div className="w-full min-h-screen bg-[#111214] text-white p-6 flex items-start gap-6">
      <div className="w-72 flex flex-col justify-between h-[calc(100vh-48px)]">
        <div className="space-y-4">
          <CategoryStack icon={Layers} title="Discovery" items={["Playlists", "Tracks", "New Finds", "Genres", "Sources"]} />
          <CategoryStack icon={Users} title="CRM" items={["Contacts", "Writers", "Outreach", "Pipelines"]} />
          <CategoryStack icon={Handshake} title="Deals" items={["Pipelines", "Active Deals", "Approvals", "Archive"]} />
        </div>

        {/* PROFILE + SETTINGS SECTION */}
        <div className="pt-6 mt-6 border-t border-white/10 space-y-3">
          {/* PROFILE */}
          <div className="flex items-center gap-3 px-4 py-2 bg-[#1A1C1E] rounded-xl border border-white/5">
            <div className="w-8 h-8 rounded-full bg-[#2A2D31]" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium text-white">PubCo Live</span>
              <span className="text-xs text-gray-400">Workspace</span>
            </div>
          </div>

          {/* SETTINGS */}
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-[#1A1C1E] hover:bg-[#2A2D31] rounded-xl border border-white/5 transition text-sm font-medium">
            <svg xmlns='http://www.w3.org/2000/svg' className='w-4 h-4 opacity-80' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth='2'><path strokeLinecap='round' strokeLinejoin='round' d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.89 3.31.876 2.42 2.42a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.89 1.543-.876 3.31-2.42 2.42a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.89-3.31-.876-2.42-2.42a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.89-1.543.876-3.31 2.42-2.42.966.557 2.185.09 2.572-1.065z'/><path strokeLinecap='round' strokeLinejoin='round' d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'/></svg>
            <span>Settings</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#0D0E10] border border-white/5 rounded-xl p-6">
        Main Content Area
      </div>
    </div>
  );
}

function CategoryStack({ title, items, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  return (
    <div className="bg-[#1A1C1E] rounded-xl shadow-md overflow-hidden border border-white/5">
      {/* HEADER */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#2A2D31] hover:bg-[#3A3E44]/80 transition font-semibold text-sm tracking-wide"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className="opacity-80" />
          <span>{title}</span>
        </div>
        <ChevronRight
          size={16}
          className={`transform transition-transform opacity-80 ${open ? "rotate-90" : "rotate-0"}`}
        />
      </button>

      {/* COLLAPSIBLE AREA */}
      <div
        className={`transition-all duration-300 overflow-hidden ${open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-2 py-2 space-y-1 bg-[#1A1C1E]/80 backdrop-blur-sm">
          {items.map((item, i) => (
            <div
              key={i}
              onClick={() => setActive(item)}
              className={`relative p-2 rounded-md text-sm transition flex items-center justify-between cursor-pointer select-none group ${
                active === item ? "bg-[#3A3E44] text-white" : "hover:bg-[#2A2D31] text-gray-300"
              }`}
            >
              {/* ACTIVE LEFT BORDER */}
              {active === item && (
                <div className="absolute left-0 top-0 h-full w-1 rounded-r bg-indigo-500" />
              )}

              <div className="flex items-center gap-2">
                {/* OPTIONAL ITEM ICON LOGIC */}
                <Disc size={14} className="opacity-60" />
                <span>{item}</span>
              </div>

              <ChevronRight size={14} className="opacity-60 group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
