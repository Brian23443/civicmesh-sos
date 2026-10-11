import {
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { PriorityColor } from "../types/incident";

export type PriorityFilter = "all" | PriorityColor;

interface TopBarProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({
  soundEnabled,
  onToggleSound,
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
  isSidebarOpen,
  onToggleSidebar,
}: TopBarProps) {
  return (
    <header className="floating-topbar" aria-label="Dashboard controls">
      {/* Accessible visually-hidden header for screen readers */}
      <h1 className="sr-only">CivicMesh-SOS Operator Dashboard</h1>

      {/* Top Left: Floating Search Bar matching Google Maps search bar */}
      <div className="floating-search-bar" role="search">
        <Search className="search-icon" size={18} aria-hidden="true" />
        <input
          aria-label="Search incidents or hazards"
          className="search-input"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search incidents, hazards..."
          type="text"
          value={searchQuery}
        />
        {searchQuery && (
          <button
            aria-label="Clear search"
            className="search-clear-btn"
            onClick={() => onSearchChange("")}
            type="button"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
        <button
          aria-label={isSidebarOpen ? "Collapse incident queue" : "Expand incident queue"}
          aria-pressed={isSidebarOpen}
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Collapse incident panel" : "Show incident panel"}
          type="button"
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={18} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Top Right: Floating Action Icons (Audio Mute + Theme Switcher) */}
      <div className="floating-actions-cluster" aria-label="System actions">
        {/* Audio Mute / Unmute Button */}
        <button
          aria-label={soundEnabled ? "Mute alert sounds" : "Enable alert sounds"}
          aria-pressed={soundEnabled}
          className="floating-icon-btn"
          onClick={onToggleSound}
          title={soundEnabled ? "Mute alert chime" : "Enable alert chime"}
          type="button"
        >
          {soundEnabled ? (
            <Volume2 size={18} aria-hidden="true" />
          ) : (
            <VolumeX size={18} aria-hidden="true" />
          )}
        </button>

        {/* Single Theme Toggle Button */}
        <button
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="floating-icon-btn theme-toggle-btn"
          onClick={onToggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          type="button"
        >
          {theme === "light" ? (
            <Moon size={18} aria-hidden="true" />
          ) : (
            <Sun size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
