"""App-wide CSS, and the bundled icons (Claude, ChatGPT, Antigravity logos)."""


from gi.repository import Gdk, Gtk

CSS = """
.cluster-card { padding: 18px; }
.status-pill { padding: 2px 10px; border-radius: 999px; font-weight: bold; font-size: smaller;
               background: alpha(currentColor, 0.1); }
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
