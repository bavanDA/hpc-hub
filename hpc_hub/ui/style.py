"""App-wide CSS, and the bundled icons (Claude, ChatGPT, Antigravity logos)."""


from gi.repository import Gdk, Gtk

CSS = """
/* Adwaita dims secondary text to 0.55, about 3:1; 0.72 reads at WCAG AA in both themes */
.dim-label, .dimmed, row .subtitle, preferencesgroup .description { opacity: 0.72; }
/* Cards (the round 3 design system): padding 16, the log under a hairline, the node in a well */
.cluster-card { padding: 16px; }
.cluster-card > expander { border-top: 1px solid alpha(currentColor, 0.08); padding-top: 8px; }
.node-well { padding: 8px 12px; border-radius: 8px; background: alpha(currentColor, 0.04); }
.open-action { padding: 6px 14px; font-weight: 600; }
.open-action image { color: @accent_color; }
/* An icon on a tinted tile (cluster cards, welcome) */
.icon-tile { min-width: 40px; min-height: 40px; border-radius: 8px;
             background: alpha(@accent_bg_color, 0.14); color: @accent_color; }
.icon-tile.neutral { background: alpha(currentColor, 0.07); color: inherit; }
.icon-tile.success { background: alpha(@success_bg_color, 0.14); color: @success_color; }
/* Status pills (ui/status.py): a dot and a word; 22px, 12px semibold */
.status-pill { padding: 0 8px; min-height: 22px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.status-pill .status-dot { min-width: 6px; min-height: 6px; border-radius: 999px; background: currentColor; }
.status-pill.success { color: @success_color; background: alpha(@success_bg_color, 0.14); }
.status-pill.info { color: @accent_color; background: alpha(@accent_bg_color, 0.14); }
.status-pill.warning { color: @warning_color; background: alpha(@warning_bg_color, 0.20); }
.status-pill.error { color: @error_color; background: alpha(@error_bg_color, 0.11); }
.status-pill.neutral { color: alpha(@window_fg_color, 0.72); background: alpha(@window_fg_color, 0.07); }
.status-pill.neutral .status-dot { background: none; border: 1.5px solid currentColor; }
.log-view { font-size: smaller; padding: 6px; }
.activity-bar { padding-top: 4px; }
.activity-tab { min-width: 46px; min-height: 46px; padding: 0; border-radius: 0; background: none;
                box-shadow: none; border-left: 2px solid transparent; opacity: 0.55; }
.activity-tab:hover { opacity: 0.9; background: none; }
.activity-tab:checked { opacity: 1; border-left-color: @accent_bg_color; background: none; }
.activity-badge { background: @accent_bg_color; color: @accent_fg_color; border-radius: 999px;
                  font-size: 9px; font-weight: bold; padding: 0 4px; min-width: 8px; margin: 6px 4px; }
.synctex-mark { background: alpha(@accent_bg_color, 0.55); border-radius: 2px; }
levelbar block.ok { background: @accent_bg_color; }
levelbar block.warn { background: @warning_bg_color; }
levelbar block.over { background: @error_bg_color; }
.monitor-bar { min-height: 24px; padding: 0 10px; border-top: 1px solid alpha(currentColor, 0.12);
               background: @view_bg_color; font-size: 11px; }
.monitor-item { opacity: 0.8; }
.monitor-value { font-family: monospace; font-feature-settings: "tnum"; }
.monitor-item.warn { opacity: 1; color: mix(@orange_3, @window_fg_color, 0.25); }  /* both themes */
.monitor-item.high { opacity: 1; color: @error_color; font-weight: bold; }
"""


def install() -> None:
    display = Gdk.Display.get_default()
    css = Gtk.CssProvider()
    css.load_from_string(CSS)
    Gtk.StyleContext.add_provider_for_display(display, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
