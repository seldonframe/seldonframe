/* @ds-bundle: {"format":3,"namespace":"SeldonFrameMobileDesignSystem_b40c95","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Skeleton","sourcePath":"components/core/Skeleton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SearchField","sourcePath":"components/forms/SearchField.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"AppHeader","sourcePath":"components/mobile/AppHeader.jsx"},{"name":"BottomTabBar","sourcePath":"components/mobile/BottomTabBar.jsx"},{"name":"EmptyState","sourcePath":"components/mobile/EmptyState.jsx"},{"name":"KpiCard","sourcePath":"components/mobile/KpiCard.jsx"},{"name":"ListRow","sourcePath":"components/mobile/ListRow.jsx"},{"name":"MessageBubble","sourcePath":"components/mobile/MessageBubble.jsx"},{"name":"QuickAction","sourcePath":"components/mobile/QuickAction.jsx"},{"name":"SectionHeader","sourcePath":"components/mobile/SectionHeader.jsx"},{"name":"Sheet","sourcePath":"components/mobile/Sheet.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"47187fe3d094","components/core/Badge.jsx":"b4f6bdb8f911","components/core/Button.jsx":"7ced590adcf6","components/core/Card.jsx":"7367666eec21","components/core/Icon.jsx":"70cf03638bb4","components/core/IconButton.jsx":"b6b454454e36","components/core/Skeleton.jsx":"4ac8bd642c96","components/forms/Input.jsx":"5089e93dcda5","components/forms/SearchField.jsx":"8a28b1622988","components/forms/SegmentedControl.jsx":"d83c3dd8c432","components/mobile/AppHeader.jsx":"73939c6f8817","components/mobile/BottomTabBar.jsx":"16fe1888d85c","components/mobile/EmptyState.jsx":"15853f585793","components/mobile/KpiCard.jsx":"072d8c724b69","components/mobile/ListRow.jsx":"72390e54f77c","components/mobile/MessageBubble.jsx":"e57038c7eab2","components/mobile/QuickAction.jsx":"182653255860","components/mobile/SectionHeader.jsx":"f44781ea7144","components/mobile/Sheet.jsx":"8f88c212786b","ui_kits/mobile-app/AppointmentsScreen.jsx":"2a397231c3a7","ui_kits/mobile-app/LeadsScreen.jsx":"38a6af30beef","ui_kits/mobile-app/MessagesScreen.jsx":"0ad1ddbdcd33","ui_kits/mobile-app/SearchOverlay.jsx":"ff182fc0d652","ui_kits/mobile-app/TodayScreen.jsx":"07ff2fa1a0a5","ui_kits/mobile-app/app.jsx":"b3248863275d","ui_kits/mobile-app/data.js":"d7e1d2e9c372"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SeldonFrameMobileDesignSystem_b40c95 = window.SeldonFrameMobileDesignSystem_b40c95 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Avatar — initials chip with a deterministic neutral tint, or a photo.
 * Quiet by default so the accent stays special. Square-rounded, not circle,
 * to match the product's calm geometry (set `round` for a circle).
 */
function hashTint(name) {
  const palette = [{
    bg: "#eaf0f7",
    fg: "#3f5572"
  }, {
    bg: "#efeafa",
    fg: "#5b4a86"
  }, {
    bg: "#eafaf2",
    fg: "#2f6b4f"
  }, {
    bg: "#faf0ea",
    fg: "#8a5a3c"
  }, {
    bg: "#f7eaf2",
    fg: "#834e6c"
  }, {
    bg: "#eaf6fa",
    fg: "#3a6678"
  }];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return palette[h % palette.length];
}
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function Avatar({
  name = "",
  src,
  size = 40,
  round = false,
  style = {},
  ...rest
}) {
  const tint = hashTint(name);
  const radius = round ? "50%" : "var(--radius-md)";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: radius,
      background: src ? "var(--gray-100)" : tint.bg,
      color: tint.fg,
      fontSize: Math.round(size * 0.36),
      fontWeight: "var(--weight-bold)",
      letterSpacing: "-0.01em",
      overflow: "hidden",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the base raised surface. Hairline border + soft layered shadow.
 * `pressable` adds a tap-scale for tappable cards. `inset` removes padding.
 */
function Card({
  children,
  pressable = false,
  padding = 16,
  radius = "var(--radius-lg)",
  elevation = "card",
  style = {},
  onClick,
  ...rest
}) {
  const shadows = {
    none: "none",
    xs: "var(--shadow-xs)",
    sm: "var(--shadow-sm)",
    card: "var(--shadow-card)"
  };
  const [pressed, setPressed] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    onPointerDown: pressable ? () => setPressed(true) : undefined,
    onPointerUp: pressable ? () => setPressed(false) : undefined,
    onPointerLeave: pressable ? () => setPressed(false) : undefined,
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-hairline)",
      borderRadius: radius,
      boxShadow: shadows[elevation],
      padding,
      transition: "transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-normal) var(--ease-out)",
      transform: pressed ? "scale(var(--card-press-scale))" : "scale(1)",
      cursor: pressable || onClick ? "pointer" : "default",
      WebkitTapHighlightColor: "transparent",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
/**
 * Icon — renders a real Lucide glyph from the global `lucide` UMD library.
 * Consistent rounded-stroke icon system for the whole product. Pass a
 * kebab-case Lucide name (e.g. "calendar-plus"). The host page must load
 * the Lucide UMD script before the bundle; the @dsCard cards and UI kits do.
 */
function toPascal(name) {
  return String(name).replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
}
function Icon({
  name,
  size = 20,
  stroke = 2,
  color,
  className = "",
  style = {},
  ...rest
}) {
  const lib = typeof window !== "undefined" && window.lucide && window.lucide.icons || null;
  const node = lib ? lib[toPascal(name)] : null;
  const svgProps = {
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color || "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: ("sf-icon " + className).trim(),
    style: {
      display: "block",
      flexShrink: 0,
      ...style
    },
    "aria-hidden": "true",
    ...rest
  };
  if (!node) {
    // graceful fallback: empty square keeps layout stable if lib not loaded
    return React.createElement("svg", svgProps);
  }
  const children = node.map((child, i) => {
    const [tag, attrs] = child;
    return React.createElement(tag, {
      key: i,
      ...attrs
    });
  });
  return React.createElement("svg", svgProps, children);
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — small status pill. `tone` picks a semantic color; `solid` fills it.
 * Use a leading dot or icon for status. Stays compact and quiet.
 */
function Badge({
  children,
  tone = "neutral",
  solid = false,
  dot = false,
  icon,
  style = {},
  ...rest
}) {
  const palette = {
    neutral: {
      fg: "var(--text-secondary)",
      soft: "var(--gray-100)",
      strong: "var(--gray-600)"
    },
    accent: {
      fg: "var(--accent-tint-fg)",
      soft: "var(--accent-soft-2)",
      strong: "var(--accent)"
    },
    positive: {
      fg: "var(--positive)",
      soft: "var(--positive-soft)",
      strong: "var(--positive)"
    },
    caution: {
      fg: "var(--caution)",
      soft: "var(--caution-soft)",
      strong: "var(--caution)"
    },
    negative: {
      fg: "var(--negative)",
      soft: "var(--negative-soft)",
      strong: "var(--negative)"
    },
    info: {
      fg: "var(--info)",
      soft: "var(--info-soft)",
      strong: "var(--info)"
    }
  };
  const c = palette[tone] || palette.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      height: "22px",
      padding: icon || dot ? "0 9px 0 8px" : "0 9px",
      borderRadius: "var(--radius-pill)",
      background: solid ? c.strong : c.soft,
      color: solid ? "#fff" : c.fg,
      fontSize: "var(--type-caption)",
      fontWeight: "var(--weight-semi)",
      letterSpacing: "var(--track-tight)",
      lineHeight: 1,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: solid ? "#fff" : c.strong
    }
  }), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 13
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — primary action control. Accent-filled by default; the accent
 * comes from the agency theme so it re-skins automatically. Tap target ≥48px.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const h = size === "sm" ? "var(--control-h-sm)" : "var(--control-h)";
  const pad = size === "sm" ? "0 14px" : "0 18px";
  const fontSize = size === "sm" ? "var(--type-label)" : "var(--type-body)";
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    height: h,
    minWidth: h,
    padding: pad,
    width: fullWidth ? "100%" : undefined,
    border: "1px solid transparent",
    borderRadius: "var(--radius-md)",
    fontSize,
    fontWeight: "var(--weight-semi)",
    letterSpacing: "var(--track-tight)",
    lineHeight: 1,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    whiteSpace: "nowrap"
  };
  const variants = {
    primary: {
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      boxShadow: "var(--shadow-accent)"
    },
    secondary: {
      background: "var(--surface-card)",
      color: "var(--text-primary)",
      borderColor: "var(--border-strong)",
      boxShadow: "var(--shadow-xs)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)"
    },
    accentSoft: {
      background: "var(--accent-soft-2)",
      color: "var(--accent-tint-fg)"
    },
    destructive: {
      background: "var(--negative-soft)",
      color: "var(--negative)"
    }
  };
  const onDown = e => {
    if (disabled || loading) return;
    e.currentTarget.style.transform = "scale(var(--press-scale))";
  };
  const onUp = e => {
    e.currentTarget.style.transform = "scale(1)";
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled || loading,
    onPointerDown: onDown,
    onPointerUp: onUp,
    onPointerLeave: onUp,
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: size === "sm" ? 16 : 18,
    style: {
      animation: "sf-spin 0.7s linear infinite"
    }
  }) : leadingIcon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: leadingIcon,
    size: size === "sm" ? 16 : 18
  }), children && /*#__PURE__*/React.createElement("span", null, children), !loading && trailingIcon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: trailingIcon,
    size: size === "sm" ? 16 : 18
  }), /*#__PURE__*/React.createElement("style", null, "@keyframes sf-spin{to{transform:rotate(360deg)}}"));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, icon-only tap target (≥44px hit area). Used for
 * header affordances, list actions, composer controls.
 */
function IconButton({
  icon,
  variant = "ghost",
  size = 44,
  iconSize = 20,
  label,
  active = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const variants = {
    ghost: {
      background: active ? "var(--accent-soft-2)" : "transparent",
      color: active ? "var(--accent-tint-fg)" : "var(--text-secondary)"
    },
    surface: {
      background: "var(--surface-card)",
      color: "var(--text-primary)",
      border: "1px solid var(--border-strong)",
      boxShadow: "var(--shadow-xs)"
    },
    accent: {
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      boxShadow: "var(--shadow-accent)"
    }
  };
  const onDown = e => {
    if (disabled) return;
    e.currentTarget.style.transform = "scale(0.92)";
  };
  const onUp = e => {
    e.currentTarget.style.transform = "scale(1)";
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    disabled: disabled,
    onPointerDown: onDown,
    onPointerUp: onUp,
    onPointerLeave: onUp,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "var(--radius-md)",
      border: "1px solid transparent",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...variants[variant],
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Skeleton.jsx
try { (() => {
/**
 * Skeleton — shimmering placeholder block for loading states. Compose several
 * to mirror the real layout. First-class loading states define perceived speed.
 */
function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-sm)",
  circle = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "sf-skeleton",
    style: {
      display: "block",
      width,
      height: circle ? width : height,
      borderRadius: circle ? "50%" : radius,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — labelled text field with optional leading icon. 48px tall, hairline
 * border, accent focus ring. Use for every single-line entry.
 */
function Input({
  label,
  icon,
  hint,
  error,
  value,
  placeholder,
  type = "text",
  style = {},
  inputStyle = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const borderColor = error ? "var(--negative)" : focus ? "var(--accent)" : "var(--border-field)";
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      marginBottom: "7px",
      fontSize: "var(--type-label)",
      fontWeight: "var(--weight-semi)",
      color: "var(--text-secondary)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      height: "var(--control-h)",
      padding: "0 14px",
      background: "var(--surface-card)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      boxShadow: focus ? "var(--focus-ring)" : "var(--shadow-xs)",
      transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)"
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      color: "var(--text-primary)",
      fontSize: "var(--type-body)",
      fontFamily: "inherit",
      ...inputStyle
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      marginTop: "6px",
      fontSize: "var(--type-caption)",
      color: error ? "var(--negative)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SearchField — pill search input with a leading magnifier and a clear button.
 * The header/overlay search affordance.
 */
function SearchField({
  value = "",
  placeholder = "Search",
  onChange,
  onClear,
  autoFocus = false,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      height: "44px",
      padding: "0 14px",
      background: "var(--surface-sunken)",
      border: `1px solid ${focus ? "var(--accent)" : "transparent"}`,
      borderRadius: "var(--radius-pill)",
      boxShadow: focus ? "var(--focus-ring)" : "none",
      transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 18,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    placeholder: placeholder,
    autoFocus: autoFocus,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      color: "var(--text-primary)",
      fontSize: "var(--type-body)",
      fontFamily: "inherit"
    }
  }, rest)), value && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Clear search",
    onClick: onClear,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      border: "none",
      background: "var(--gray-300)",
      color: "var(--gray-600)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 13
  })));
}
Object.assign(__ds_scope, { SearchField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchField.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
/**
 * SegmentedControl — the All / Unread style tab toggle. A sliding accent-ink
 * pill moves under the active item. Use for 2–4 short options.
 */
function SegmentedControl({
  options = [],
  value,
  onChange,
  style = {}
}) {
  const items = options.map(o => typeof o === "string" ? {
    value: o,
    label: o
  } : o);
  const activeIndex = Math.max(0, items.findIndex(i => i.value === value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "grid",
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap: "2px",
      padding: "3px",
      background: "var(--surface-sunken)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      top: "3px",
      bottom: "3px",
      left: `calc(3px + ${activeIndex} * ((100% - 6px) / ${items.length}))`,
      width: `calc((100% - 6px) / ${items.length})`,
      background: "var(--surface-card)",
      borderRadius: "calc(var(--radius-md) - 3px)",
      boxShadow: "var(--shadow-xs)",
      transition: "left var(--dur-normal) var(--ease-out)"
    }
  }), items.map(item => {
    const active = item.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: item.value,
      type: "button",
      onClick: () => onChange && onChange(item.value),
      style: {
        position: "relative",
        zIndex: 1,
        height: "36px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: "var(--type-label)",
        fontWeight: "var(--weight-semi)",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease-out)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px"
      }
    }, item.label, item.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--type-caption)",
        fontWeight: "var(--weight-bold)",
        color: active ? "var(--accent)" : "var(--text-faint)",
        fontVariantNumeric: "tabular-nums"
      }
    }, item.count));
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/mobile/AppHeader.jsx
try { (() => {
/**
 * AppHeader — the white-label header. Agency logo monogram + workspace name
 * (a switcher), plus search and settings affordances. Never shows vendor
 * branding. `logoSrc` overrides the monogram with a real agency logo.
 */
function AppHeader({
  workspace = "Workspace",
  monogram,
  logoSrc,
  onSearch,
  onSettings,
  onSwitch,
  style = {}
}) {
  const initial = monogram || (workspace ? workspace[0].toUpperCase() : "•");
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      height: "var(--header-h)",
      padding: "0 8px 0 16px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-hairline)",
      ...style
    }
  }, logoSrc ? /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: workspace,
    style: {
      height: "30px",
      width: "30px",
      borderRadius: "8px",
      objectFit: "cover",
      flexShrink: 0
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "30px",
      height: "30px",
      borderRadius: "8px",
      background: "var(--accent)",
      color: "var(--text-on-accent)",
      fontSize: "15px",
      fontWeight: "var(--weight-heavy)",
      flexShrink: 0
    }
  }, initial), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onSwitch,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flex: 1,
      minWidth: 0,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      padding: "6px 4px",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--type-heading)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--track-tight)",
      color: "var(--text-primary)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, workspace), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevrons-up-down",
    size: 16,
    color: "var(--text-faint)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "search",
    label: "Search",
    onClick: onSearch
  }), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "settings",
    label: "Settings",
    onClick: onSettings
  })));
}
Object.assign(__ds_scope, { AppHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/AppHeader.jsx", error: String((e && e.message) || e) }); }

// components/mobile/BottomTabBar.jsx
try { (() => {
/**
 * BottomTabBar — the persistent navigation. Default tabs: Today, Leads,
 * Messages, Appts. Pass your own `tabs` to add Dialer/Documents later — the
 * bar stays balanced. Active item uses the agency accent. Honors safe-area.
 */
const DEFAULT_TABS = [{
  key: "today",
  label: "Today",
  icon: "house"
}, {
  key: "leads",
  label: "Leads",
  icon: "users-round"
}, {
  key: "messages",
  label: "Messages",
  icon: "message-square"
}, {
  key: "appts",
  label: "Appts",
  icon: "calendar"
}];
function BottomTabBar({
  tabs = DEFAULT_TABS,
  active,
  onChange,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "grid",
      gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
      alignItems: "stretch",
      background: "color-mix(in srgb, var(--surface-card) 86%, transparent)",
      backdropFilter: "saturate(180%) blur(18px)",
      WebkitBackdropFilter: "saturate(180%) blur(18px)",
      borderTop: "1px solid var(--border-hairline)",
      paddingBottom: "var(--safe-bottom)",
      ...style
    }
  }, tabs.map(tab => {
    const isActive = tab.key === active;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.key,
      type: "button",
      onClick: () => onChange && onChange(tab.key),
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        height: "var(--tabbar-h)",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: isActive ? "var(--accent)" : "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease-out)",
        WebkitTapHighlightColor: "transparent"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: tab.icon,
      size: 22,
      stroke: isActive ? 2.25 : 2
    }), tab.badge != null && tab.badge !== 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: "-5px",
        right: "-8px",
        minWidth: "16px",
        height: "16px",
        padding: "0 4px",
        borderRadius: "999px",
        background: "var(--negative)",
        color: "#fff",
        fontSize: "10px",
        fontWeight: "var(--weight-bold)",
        lineHeight: "16px",
        textAlign: "center",
        border: "1.5px solid var(--surface-card)"
      }
    }, tab.badge)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "11px",
        fontWeight: isActive ? "var(--weight-bold)" : "var(--weight-medium)",
        letterSpacing: "0.01em"
      }
    }, tab.label));
  }));
}
Object.assign(__ds_scope, { BottomTabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/BottomTabBar.jsx", error: String((e && e.message) || e) }); }

// components/mobile/EmptyState.jsx
try { (() => {
/**
 * EmptyState — first-class empty screen: a soft icon medallion, a calm
 * headline, one line of guidance, and an optional primary action. These
 * define perceived quality, so they're never an afterthought.
 */
function EmptyState({
  icon = "inbox",
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "40px 28px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "60px",
      height: "60px",
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-sunken)",
      color: "var(--text-faint)",
      marginBottom: "18px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 26
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: "var(--type-heading)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--track-tight)",
      color: "var(--text-primary)"
    }
  }, title), body && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      maxWidth: "260px",
      fontSize: "var(--type-label)",
      lineHeight: "var(--lh-normal)",
      color: "var(--text-muted)"
    }
  }, body), actionLabel && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "22px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    leadingIcon: actionIcon,
    onClick: onAction
  }, actionLabel)));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/mobile/KpiCard.jsx
try { (() => {
/**
 * KpiCard — a single "glance" metric tile for the Today screen. Tinted icon
 * chip, big tabular value, label, optional delta/attention note. Accent is
 * used only on the active/attention tile to keep it special.
 */
function KpiCard({
  icon,
  label,
  value,
  tone = "neutral",
  note,
  onClick,
  style = {}
}) {
  const tones = {
    neutral: {
      chipBg: "var(--gray-100)",
      chipFg: "var(--gray-600)"
    },
    accent: {
      chipBg: "var(--accent-soft-2)",
      chipFg: "var(--accent)"
    },
    positive: {
      chipBg: "var(--positive-soft)",
      chipFg: "var(--positive)"
    },
    caution: {
      chipBg: "var(--caution-soft)",
      chipFg: "var(--caution)"
    },
    negative: {
      chipBg: "var(--negative-soft)",
      chipFg: "var(--negative)"
    }
  };
  const t = tones[tone] || tones.neutral;
  const [pressed, setPressed] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onPointerDown: () => onClick && setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "14px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-hairline)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-card)",
      cursor: onClick ? "pointer" : "default",
      transform: pressed ? "scale(var(--card-press-scale))" : "scale(1)",
      transition: "transform var(--dur-fast) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "34px",
      height: "34px",
      borderRadius: "var(--radius-sm)",
      background: t.chipBg,
      color: t.chipFg
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "26px",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--track-title)",
      lineHeight: 1.05,
      color: "var(--text-primary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--type-label)",
      color: "var(--text-secondary)"
    }
  }, label), note && /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: "2px",
      fontSize: "var(--type-caption)",
      fontWeight: "var(--weight-medium)",
      color: tone === "neutral" ? "var(--text-muted)" : t.chipFg
    }
  }, note)));
}
Object.assign(__ds_scope, { KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/KpiCard.jsx", error: String((e && e.message) || e) }); }

// components/mobile/ListRow.jsx
try { (() => {
/**
 * ListRow — the workhorse row: a leading slot (avatar/icon), a title +
 * subtitle stack, and a trailing slot (meta text, badge, chevron). Tappable
 * with a soft press highlight. Use for up-next, inbox, search results.
 */
function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  chevron = false,
  unread = false,
  onClick,
  style = {}
}) {
  const [pressed, setPressed] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onPointerDown: () => onClick && setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    style: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      minHeight: "var(--tap-min)",
      padding: "10px 12px",
      borderRadius: "var(--radius-md)",
      background: pressed ? "var(--surface-sunken)" : "transparent",
      cursor: onClick ? "pointer" : "default",
      transition: "background var(--dur-fast) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    }
  }, leading != null && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, leading), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      fontSize: "var(--type-subhead)",
      fontWeight: unread ? "var(--weight-bold)" : "var(--weight-semi)",
      color: "var(--text-primary)",
      letterSpacing: "var(--track-tight)"
    }
  }, unread && /*#__PURE__*/React.createElement("span", {
    style: {
      width: "7px",
      height: "7px",
      borderRadius: "50%",
      background: "var(--accent)",
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, title)), subtitle != null && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "2px",
      fontSize: "var(--type-caption)",
      color: "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, subtitle)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexShrink: 0
    }
  }, meta != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--type-caption)",
      color: "var(--text-faint)",
      whiteSpace: "nowrap"
    }
  }, meta), trailing, chevron && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--text-faint)"
  })));
}
Object.assign(__ds_scope, { ListRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/ListRow.jsx", error: String((e && e.message) || e) }); }

// components/mobile/MessageBubble.jsx
try { (() => {
/**
 * MessageBubble — an SMS-style bubble. `direction="in"` (left, neutral),
 * `direction="out"` (right, accent fill). `variant="note"` is a clearly
 * internal-only private note. `pending` dims the bubble for the
 * texting-not-enabled state.
 */
function MessageBubble({
  direction = "in",
  variant = "sms",
  pending = false,
  children,
  time,
  authorLabel,
  style = {}
}) {
  if (variant === "note") {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        margin: "2px 0",
        ...style
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: "82%",
        background: "var(--caution-soft)",
        border: "1px dashed color-mix(in srgb, var(--caution) 40%, transparent)",
        borderRadius: "var(--radius-md)",
        padding: "9px 12px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        marginBottom: "3px",
        fontSize: "var(--type-micro)",
        fontWeight: "var(--weight-bold)",
        letterSpacing: "var(--track-eyebrow)",
        textTransform: "uppercase",
        color: "var(--caution)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "lock",
      size: 11
    }), authorLabel || "Private note"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: "var(--type-label)",
        color: "var(--text-secondary)",
        lineHeight: "var(--lh-snug)"
      }
    }, children), time && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "4px",
        fontSize: "11px",
        color: "var(--text-faint)"
      }
    }, time)));
  }
  const out = direction === "out";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: out ? "flex-end" : "flex-start",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "78%",
      display: "flex",
      flexDirection: "column",
      alignItems: out ? "flex-end" : "flex-start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "9px 13px",
      borderRadius: "16px",
      borderBottomRightRadius: out ? "5px" : "16px",
      borderBottomLeftRadius: out ? "16px" : "5px",
      background: out ? pending ? "color-mix(in srgb, var(--accent) 45%, var(--gray-200))" : "var(--accent)" : "var(--surface-sunken)",
      color: out ? "var(--text-on-accent)" : "var(--text-primary)",
      fontSize: "var(--type-body)",
      lineHeight: "var(--lh-snug)",
      opacity: pending ? 0.85 : 1,
      boxShadow: out ? "none" : "var(--shadow-xs)"
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginTop: "4px",
      padding: "0 2px",
      fontSize: "11px",
      color: "var(--text-faint)"
    }
  }, pending && out && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "clock",
    size: 11
  }), pending && out ? "Pending — texting not enabled" : time)));
}
Object.assign(__ds_scope, { MessageBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/MessageBubble.jsx", error: String((e && e.message) || e) }); }

// components/mobile/QuickAction.jsx
try { (() => {
/**
 * QuickAction — a compact icon tile in the Today quick-actions row. Custom
 * line icon over a short label; subtle press feedback. No emoji, ever.
 */
function QuickAction({
  icon,
  label,
  onClick,
  style = {}
}) {
  const [pressed, setPressed] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      padding: "12px 6px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-hairline)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-xs)",
      cursor: "pointer",
      transform: pressed ? "scale(var(--press-scale))" : "scale(1)",
      transition: "transform var(--dur-fast) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      minHeight: "var(--tap-min)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "38px",
      height: "38px",
      borderRadius: "var(--radius-sm)",
      background: "var(--accent-soft)",
      color: "var(--accent)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 19
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--type-caption)",
      fontWeight: "var(--weight-semi)",
      color: "var(--text-secondary)",
      textAlign: "center",
      lineHeight: 1.2
    }
  }, label));
}
Object.assign(__ds_scope, { QuickAction });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/QuickAction.jsx", error: String((e && e.message) || e) }); }

// components/mobile/SectionHeader.jsx
try { (() => {
/**
 * SectionHeader — the small title row above a list/section. Optional trailing
 * text action (e.g. "See all") that uses the accent.
 */
function SectionHeader({
  title,
  actionLabel,
  onAction,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "12px",
      padding: "0 2px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: "var(--type-heading)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--track-tight)",
      color: "var(--text-primary)"
    }
  }, title), actionLabel && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: "var(--type-label)",
      fontWeight: "var(--weight-semi)",
      color: "var(--accent)",
      padding: "4px"
    }
  }, actionLabel, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 15
  })));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/mobile/Sheet.jsx
try { (() => {
/**
 * Sheet — bottom sheet that springs up over a scrim. Rounded top, grab handle,
 * optional title row, scrollable body, sticky footer. Positions itself
 * absolutely inside the nearest positioned ancestor (e.g. a phone frame).
 */
function Sheet({
  open = true,
  onClose,
  title,
  children,
  footer,
  maxHeight = "86%",
  style = {}
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "absolute",
      inset: 0,
      background: "var(--scrim)",
      animation: "sf-fade var(--dur-normal) var(--ease-out) both"
    }
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      position: "relative",
      maxHeight,
      display: "flex",
      flexDirection: "column",
      background: "var(--surface-overlay)",
      borderTopLeftRadius: "var(--radius-xl)",
      borderTopRightRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-sheet)",
      paddingBottom: "var(--safe-bottom)",
      animation: "sf-sheet-in var(--dur-slow) var(--ease-spring) both",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      padding: "8px 0 2px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "38px",
      height: "4px",
      borderRadius: "999px",
      background: "var(--gray-300)"
    }
  })), title && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "8px 16px 12px",
      borderBottom: "1px solid var(--border-hairline)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: "var(--type-title)",
      fontWeight: "var(--weight-bold)",
      letterSpacing: "var(--track-title)",
      color: "var(--text-primary)"
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Close",
    onClick: onClose,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "32px",
      height: "32px",
      borderRadius: "50%",
      border: "none",
      background: "var(--surface-sunken)",
      color: "var(--text-secondary)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 17
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: "auto",
      padding: "16px",
      flex: 1
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      borderTop: "1px solid var(--border-hairline)",
      background: "var(--surface-card)"
    }
  }, footer)));
}
Object.assign(__ds_scope, { Sheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/mobile/Sheet.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/AppointmentsScreen.jsx
try { (() => {
/* AppointmentsScreen — month/week calendar with booking dots + agenda + detail sheet. */
function AppointmentsScreen({
  data,
  agency,
  loading
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    SegmentedControl,
    Card,
    ListRow,
    Avatar,
    Badge,
    Icon,
    Sheet,
    Button,
    Skeleton,
    IconButton
  } = NS;
  const cal = window.KIT_DATA.calendar;
  const [view, setView] = React.useState("month");
  const [sel, setSel] = React.useState(cal.today);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const toneColor = {
    accent: "var(--accent)",
    info: "var(--info)",
    caution: "var(--caution)",
    positive: "var(--positive)"
  };
  const key = d => `${cal.year}-${String(cal.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const apptsOn = d => data.appointments[key(d)] || [];
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 42,
      radius: "12px"
    }), /*#__PURE__*/React.createElement(Card, {
      padding: 14
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "40%",
      height: 14
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 14
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 150,
      radius: "12px"
    })), /*#__PURE__*/React.createElement(Skeleton, {
      width: "35%",
      height: 14
    }), [0, 1].map(i => /*#__PURE__*/React.createElement(Skeleton, {
      key: i,
      width: "100%",
      height: 60,
      radius: "12px"
    })));
  }
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const cells = [];
  for (let i = 0; i < cal.firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= cal.days; d++) cells.push(d);
  const dayName = d => {
    const wd = (cal.firstWeekday + d - 1) % 7;
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd];
  };

  // Week strip days around selection
  const weekStart = sel - (cal.firstWeekday + sel - 1) % 7;
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart + i;
    if (d >= 1 && d <= cal.days) weekDays.push(d);
  }
  const selAppts = apptsOn(sel);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: view,
    onChange: setView,
    options: [{
      value: "month",
      label: "Month"
    }, {
      value: "week",
      label: "Week"
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 14
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: "-0.01em",
      color: "var(--text-primary)"
    }
  }, cal.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-left",
    label: "Previous",
    size: 36,
    iconSize: 18
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-right",
    label: "Next",
    size: 36,
    iconSize: 18
  }))), view === "month" ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7,1fr)",
      marginBottom: 6
    }
  }, weekdays.map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      textAlign: "center",
      fontSize: 11,
      fontWeight: 700,
      color: "var(--text-faint)"
    }
  }, w))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7,1fr)",
      gap: 2
    }
  }, cells.map((d, i) => {
    if (d === null) return /*#__PURE__*/React.createElement("div", {
      key: i
    });
    const ap = apptsOn(d);
    const isSel = d === sel;
    const isToday = d === cal.today;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      onClick: () => setSel(d),
      style: {
        aspectRatio: "1",
        border: "none",
        borderRadius: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: isSel ? "var(--accent)" : "transparent",
        color: isSel ? "var(--text-on-accent)" : isToday ? "var(--accent)" : "var(--text-primary)",
        fontWeight: isToday || isSel ? 700 : 500,
        fontSize: 14,
        position: "relative",
        transition: "background var(--dur-fast) var(--ease-out)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontVariantNumeric: "tabular-nums"
      }
    }, d), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "flex",
        gap: 2,
        height: 4
      }
    }, ap.slice(0, 3).map((a, j) => /*#__PURE__*/React.createElement("span", {
      key: j,
      style: {
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: isSel ? "rgba(255,255,255,0.9)" : toneColor[a.tone]
      }
    }))));
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: `repeat(${weekDays.length},1fr)`,
      gap: 6
    }
  }, weekDays.map(d => {
    const ap = apptsOn(d);
    const isSel = d === sel;
    return /*#__PURE__*/React.createElement("button", {
      key: d,
      type: "button",
      onClick: () => setSel(d),
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 0",
        border: "1px solid " + (isSel ? "var(--accent)" : "var(--border-hairline)"),
        borderRadius: 12,
        cursor: "pointer",
        background: isSel ? "var(--accent-soft)" : "var(--surface-card)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: "var(--text-faint)"
      }
    }, dayName(d).slice(0, 1)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: isSel ? "var(--accent)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums"
      }
    }, d), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: ap.length ? toneColor[ap[0].tone] : "transparent"
      }
    }));
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      marginBottom: 8,
      padding: "0 2px"
    }
  }, dayName(sel), ", Jun ", sel, " \xB7 ", selAppts.length, " ", selAppts.length === 1 ? "booking" : "bookings"), selAppts.length === 0 ? /*#__PURE__*/React.createElement(Card, {
    padding: 20,
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar-x",
    size: 22,
    color: "var(--text-faint)",
    style: {
      margin: "0 auto 8px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, "No bookings this day")) : /*#__PURE__*/React.createElement(Card, {
    padding: 6
  }, selAppts.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: a.id
  }, /*#__PURE__*/React.createElement(ListRow, {
    onClick: () => setSheetOpen(true),
    leading: /*#__PURE__*/React.createElement(Avatar, {
      name: a.who
    }),
    title: a.title,
    subtitle: a.who,
    meta: a.time,
    trailing: /*#__PURE__*/React.createElement(Badge, {
      tone: a.tone,
      dot: true
    }, a.tone === "caution" ? "Pending" : "Confirmed"),
    chevron: true
  }), i < selAppts.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--border-hairline)",
      margin: "0 12px"
    }
  }))))), /*#__PURE__*/React.createElement(BookingDetailSheet, {
    open: sheetOpen,
    onClose: () => setSheetOpen(false),
    detail: data.bookingDetail,
    NS: NS
  }));
}
function BookingDetailSheet({
  open,
  onClose,
  detail,
  NS
}) {
  const {
    Sheet,
    Badge,
    Icon,
    Button,
    Avatar
  } = NS;
  const Field = ({
    icon,
    label,
    value
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      padding: "12px 0",
      borderBottom: "1px solid var(--border-hairline)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18,
    color: "var(--text-faint)",
    style: {
      marginTop: 1,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      marginBottom: 2
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--text-primary)",
      lineHeight: 1.4
    }
  }, value)));
  return /*#__PURE__*/React.createElement(Sheet, {
    open: open,
    onClose: onClose,
    title: "Booking details",
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      leadingIcon: "calendar-clock",
      fullWidth: true
    }, "Reschedule"), /*#__PURE__*/React.createElement(Button, {
      variant: "destructive",
      leadingIcon: "x",
      fullWidth: true
    }, "Cancel"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: detail.who,
    size: 48
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: "-0.01em",
      color: "var(--text-primary)"
    }
  }, detail.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)"
    }
  }, detail.who)), /*#__PURE__*/React.createElement(Badge, {
    tone: detail.tone,
    dot: true
  }, detail.status)), /*#__PURE__*/React.createElement(Field, {
    icon: "wrench",
    label: "Service",
    value: `${detail.service} · ${detail.duration} · ${detail.price}`
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "calendar",
    label: "When",
    value: `${detail.date} · ${detail.time}`
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "map-pin",
    label: "Address",
    value: detail.addr
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "phone",
    label: "Phone",
    value: detail.phone
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "mail",
    label: "Email",
    value: detail.email
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "message-square-text",
    label: "Customer notes",
    value: detail.notes
  }), /*#__PURE__*/React.createElement(Field, {
    icon: "sparkles",
    label: "Booked via",
    value: detail.source
  }));
}
window.AppointmentsScreen = AppointmentsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/AppointmentsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/LeadsScreen.jsx
try { (() => {
/* LeadsScreen — pipeline list of leads with stage, value, source. */
function LeadsScreen({
  data,
  agency,
  loading
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    SearchField,
    SegmentedControl,
    Card,
    ListRow,
    Avatar,
    Badge,
    Skeleton,
    Icon
  } = NS;
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 44,
      radius: "999px"
    }), [0, 1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 12,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: 40,
      circle: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "50%",
      height: 12
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 8
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "35%",
      height: 11
    })))));
  }
  let list = data.leads;
  if (q.trim()) list = list.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));
  if (filter === "open") list = list.filter(l => l.tone !== "positive");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(SearchField, {
    value: q,
    onChange: e => setQ(e.target.value),
    onClear: () => setQ(""),
    placeholder: "Search leads"
  }), /*#__PURE__*/React.createElement(SegmentedControl, {
    value: filter,
    onChange: setFilter,
    options: [{
      value: "all",
      label: "All leads",
      count: data.leads.length
    }, {
      value: "open",
      label: "Open"
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 6
  }, list.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: l.id
  }, /*#__PURE__*/React.createElement(ListRow, {
    leading: /*#__PURE__*/React.createElement(Avatar, {
      name: l.name
    }),
    title: l.name,
    subtitle: /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "globe",
      size: 12,
      color: "var(--text-faint)"
    }), l.source, " \xB7 ", l.time, " ago"),
    trailing: /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-primary)",
        fontVariantNumeric: "tabular-nums"
      }
    }, l.value), /*#__PURE__*/React.createElement(Badge, {
      tone: l.tone
    }, l.stage))
  }), i < list.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--border-hairline)",
      margin: "0 12px"
    }
  })))));
}
window.LeadsScreen = LeadsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/LeadsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/MessagesScreen.jsx
try { (() => {
/* MessagesScreen — inbox (All/Unread + search) and a thread view with a composer. */
function MessagesScreen({
  data,
  agency,
  loading
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    SegmentedControl,
    SearchField,
    ListRow,
    Avatar,
    Badge,
    MessageBubble,
    Icon,
    IconButton,
    Skeleton,
    Card
  } = NS;
  const [tab, setTab] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const open = openId ? data.conversations.find(c => c.id === openId) : null;
  const textingDisabled = open && open.pendingNumber;
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 44,
      radius: "999px"
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 42,
      radius: "12px"
    }), [0, 1, 2, 3, 4].map(i => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "4px 2px"
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: 40,
      circle: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "45%",
      height: 12
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 8
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "80%",
      height: 11
    })))));
  }

  // ── Thread view ───────────────────────────────────────────────
  if (open) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 8px 10px 6px",
        borderBottom: "1px solid var(--border-hairline)",
        background: "var(--surface-card)"
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "chevron-left",
      label: "Back",
      onClick: () => setOpenId(null)
    }), /*#__PURE__*/React.createElement(Avatar, {
      name: open.name,
      size: 36
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 15,
        fontWeight: 600,
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, open.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--text-muted)"
      }
    }, open.channel)), /*#__PURE__*/React.createElement(IconButton, {
      icon: "phone",
      label: "Call"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: "auto",
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface-app)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-faint)",
        fontWeight: 600
      }
    }, "TODAY"), data.thread.map(m => /*#__PURE__*/React.createElement(MessageBubble, {
      key: m.id,
      direction: m.dir === "out" ? "out" : "in",
      variant: m.dir === "note" ? "note" : "sms",
      time: m.time,
      authorLabel: m.author
    }, m.body))), textingDisabled ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 14,
        borderTop: "1px solid var(--border-hairline)",
        background: "var(--surface-card)"
      }
    }, /*#__PURE__*/React.createElement(Card, {
      padding: 12,
      style: {
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: "var(--caution-soft)",
        border: "1px solid color-mix(in srgb, var(--caution) 28%, transparent)",
        boxShadow: "none"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "lock",
      size: 16,
      color: "var(--caution)",
      style: {
        marginTop: 2
      }
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-primary)"
      }
    }, "Texting isn't enabled yet"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--text-secondary)",
        marginTop: 2
      }
    }, "Connect a phone number to reply by SMS. Until then, replies stay as private notes.")))) : /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px calc(10px + var(--safe-bottom))",
        borderTop: "1px solid var(--border-hairline)",
        background: "var(--surface-card)"
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "sticky-note",
      label: "Private note",
      variant: "ghost"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        background: "var(--surface-sunken)",
        borderRadius: 999,
        padding: "0 6px 0 14px",
        height: 44
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: draft,
      onChange: e => setDraft(e.target.value),
      placeholder: "Text message",
      style: {
        flex: 1,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 15,
        fontFamily: "inherit",
        color: "var(--text-primary)"
      }
    })), /*#__PURE__*/React.createElement(IconButton, {
      icon: "send",
      label: "Send",
      variant: draft ? "accent" : "ghost"
    })));
  }

  // ── Inbox view ────────────────────────────────────────────────
  let list = data.conversations;
  if (tab === "unread") list = list.filter(c => c.unread);
  if (q.trim()) list = list.filter(c => (c.name + c.preview).toLowerCase().includes(q.toLowerCase()));
  const unreadCount = data.conversations.filter(c => c.unread).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(SearchField, {
    value: q,
    onChange: e => setQ(e.target.value),
    onClear: () => setQ(""),
    placeholder: "Search messages"
  }), /*#__PURE__*/React.createElement(SegmentedControl, {
    value: tab,
    onChange: setTab,
    options: [{
      value: "all",
      label: "All"
    }, {
      value: "unread",
      label: "Unread",
      count: unreadCount
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 6
  }, list.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 12px",
      textAlign: "center",
      color: "var(--text-muted)",
      fontSize: 14
    }
  }, "No conversations here.") : list.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: c.id
  }, /*#__PURE__*/React.createElement(ListRow, {
    onClick: () => setOpenId(c.id),
    leading: /*#__PURE__*/React.createElement(Avatar, {
      name: c.name
    }),
    title: c.name,
    subtitle: c.preview,
    meta: c.time,
    unread: c.unread,
    trailing: c.pendingNumber ? /*#__PURE__*/React.createElement(Badge, {
      tone: "caution",
      icon: "lock"
    }, "Pending") : c.channel === "New lead" ? /*#__PURE__*/React.createElement(Badge, {
      tone: "accent"
    }, "New") : null
  }), i < list.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--border-hairline)",
      margin: "0 12px"
    }
  })))));
}
window.MessagesScreen = MessagesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/MessagesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/SearchOverlay.jsx
try { (() => {
/* SearchOverlay — fast full-screen search with grouped results. */
function SearchOverlay({
  data,
  onClose
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    SearchField,
    ListRow,
    Avatar,
    Icon
  } = NS;
  const [q, setQ] = React.useState("");
  const recents = ["Maria Delgado", "Furnace quote", "Today's bookings"];
  const groups = [{
    key: "contacts",
    label: "Contacts",
    icon: "user",
    rows: data.search.contacts
  }, {
    key: "deals",
    label: "Deals",
    icon: "circle-dollar-sign",
    rows: data.search.deals
  }, {
    key: "appts",
    label: "Appointments",
    icon: "calendar",
    rows: data.search.appts
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      zIndex: 60,
      display: "flex",
      flexDirection: "column",
      background: "var(--surface-app)",
      animation: "sf-fade var(--dur-fast) var(--ease-out) both"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "calc(10px + var(--safe-top)) 14px 12px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-hairline)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(SearchField, {
    autoFocus: true,
    value: q,
    onChange: e => setQ(e.target.value),
    onClear: () => setQ(""),
    placeholder: "Search everything"
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    style: {
      border: "none",
      background: "transparent",
      color: "var(--accent)",
      fontSize: 15,
      fontWeight: 600,
      cursor: "pointer",
      padding: "6px 4px"
    }
  }, "Cancel")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "14px 16px"
    }
  }, !q.trim() ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      marginBottom: 8
    }
  }, "Recent"), recents.map(r => /*#__PURE__*/React.createElement("div", {
    key: r,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "11px 4px",
      cursor: "pointer"
    },
    onClick: () => setQ(r)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 17,
    color: "var(--text-faint)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "var(--text-secondary)"
    }
  }, r)))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, groups.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.key
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: g.icon,
    size: 13
  }), g.label), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-hairline)",
      borderRadius: 14,
      boxShadow: "var(--shadow-xs)",
      padding: 6
    }
  }, g.rows.map((r, i) => /*#__PURE__*/React.createElement(ListRow, {
    key: i,
    leading: /*#__PURE__*/React.createElement(Avatar, {
      name: r.name,
      size: 34
    }),
    title: r.name,
    subtitle: r.sub,
    chevron: true
  }))))))));
}
window.SearchOverlay = SearchOverlay;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/SearchOverlay.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/TodayScreen.jsx
try { (() => {
/* TodayScreen — the "glance" home: KPIs, pipeline, quick actions, up-next. */
function TodayScreen({
  data,
  agency,
  loading,
  onOpenStages,
  onOpenAppt
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    KpiCard,
    QuickAction,
    SectionHeader,
    ListRow,
    Card,
    Avatar,
    Badge,
    Icon,
    Skeleton
  } = NS;
  const toneColor = {
    accent: "var(--accent)",
    info: "var(--info)",
    caution: "var(--caution)",
    positive: "var(--positive)",
    neutral: "var(--gray-400)"
  };
  if (loading) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12
      }
    }, [0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement(Card, {
      key: i,
      padding: 14
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: 34,
      height: 34,
      radius: "8px"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 10
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "50%",
      height: 22
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 8
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "70%",
      height: 11
    })))), /*#__PURE__*/React.createElement(Card, {
      padding: 16
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: "40%",
      height: 11
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 12
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "55%",
      height: 26
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 16
      }
    }), /*#__PURE__*/React.createElement(Skeleton, {
      width: "100%",
      height: 10,
      radius: "999px"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 10
      }
    }, [0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement(Card, {
      key: i,
      padding: 12,
      style: {
        height: 78,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement(Skeleton, {
      width: 38,
      height: 38,
      radius: "8px"
    })))));
  }
  const fmt = n => "$" + n.toLocaleString("en-US");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(KpiCard, {
    icon: "user-plus",
    label: "New leads",
    value: data.kpis.leads,
    tone: "accent",
    note: data.kpis.leads > 0 ? "Tap Leads to work" : "All clear"
  }), /*#__PURE__*/React.createElement(KpiCard, {
    icon: "calendar-check",
    label: "Today's appts",
    value: data.kpis.appts,
    tone: "neutral"
  }), /*#__PURE__*/React.createElement(KpiCard, {
    icon: "message-square",
    label: "Unread",
    value: data.kpis.unread,
    tone: data.kpis.unread ? "caution" : "neutral",
    note: data.kpis.unread ? "Needs a reply" : undefined
  }), /*#__PURE__*/React.createElement(KpiCard, {
    icon: "phone-missed",
    label: "Missed calls",
    value: data.kpis.missed,
    tone: data.kpis.missed ? "negative" : "positive",
    note: data.kpis.missed ? "Call back" : "None today"
  })), /*#__PURE__*/React.createElement(Card, {
    pressable: true,
    onClick: onOpenStages,
    padding: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow"
  }, "Open pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: "-0.022em",
      color: "var(--text-primary)",
      fontVariantNumeric: "tabular-nums",
      marginTop: 6
    }
  }, fmt(data.pipeline)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)",
      marginTop: 2
    }
  }, data.stages.reduce((s, x) => s + x.count, 0), " open deals across ", data.stages.length, " stages")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
      fontSize: 13,
      fontWeight: 600,
      color: "var(--accent)"
    }
  }, "By stage ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 3,
      marginTop: 16,
      height: 8,
      borderRadius: 999,
      overflow: "hidden"
    }
  }, data.stages.map(s => /*#__PURE__*/React.createElement("span", {
    key: s.name,
    style: {
      flex: s.value,
      background: toneColor[s.tone],
      borderRadius: 999
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginTop: 10,
      flexWrap: "wrap"
    }
  }, data.stages.map(s => /*#__PURE__*/React.createElement("span", {
    key: s.name,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 12,
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      background: toneColor[s.tone]
    }
  }), s.name)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "t-eyebrow",
    style: {
      marginBottom: 10,
      padding: "0 2px"
    }
  }, "Quick actions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(QuickAction, {
    icon: "user-plus",
    label: "Add contact"
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: "calendar-plus",
    label: "New booking"
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: "star",
    label: "Request review"
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: "scan-line",
    label: "Scan card"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, {
    title: "Up next",
    actionLabel: "See all",
    style: {
      marginBottom: 8
    }
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 6
  }, data.upNext.map((u, i) => /*#__PURE__*/React.createElement("div", {
    key: u.id
  }, /*#__PURE__*/React.createElement(ListRow, {
    onClick: () => onOpenAppt && onOpenAppt(u.id),
    leading: /*#__PURE__*/React.createElement(Avatar, {
      name: u.who
    }),
    title: u.title,
    subtitle: u.who + " · " + u.addr,
    meta: u.time,
    trailing: /*#__PURE__*/React.createElement(Badge, {
      tone: u.tone,
      dot: true
    }, u.status),
    chevron: true
  }), i < data.upNext.length - 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--border-hairline)",
      margin: "0 12px"
    }
  }))))));
}
window.TodayScreen = TodayScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/TodayScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/app.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* app.jsx — PhoneFrame + a full interactive AppInstance. The page renders TWO
   instances (Phoenix HVAC / violet and RedDoor Spa / rose) to prove the
   white-label system holds in any accent. */

function StatusBar() {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    Icon
  } = NS;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      padding: "0 22px 6px",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: "-0.01em",
      color: "var(--text-primary)",
      fontVariantNumeric: "tabular-nums"
    }
  }, "9:41"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      color: "var(--text-primary)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "signal",
    size: 15
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "wifi",
    size: 15
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "battery-full",
    size: 17
  })));
}
function PhoneFrame({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 844,
      flexShrink: 0,
      background: "#0c0e12",
      borderRadius: 52,
      padding: 5,
      boxShadow: "0 40px 90px rgba(15,20,28,0.30), 0 8px 24px rgba(15,20,28,0.18)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      height: "100%",
      background: "var(--surface-card)",
      borderRadius: 47,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 11,
      left: "50%",
      transform: "translateX(-50%)",
      width: 116,
      height: 32,
      background: "#0c0e12",
      borderRadius: 999,
      zIndex: 100
    }
  }), children));
}
function AppInstance({
  agencyId
}) {
  const NS = window.SeldonFrameMobileDesignSystem_b40c95;
  const {
    AppHeader,
    BottomTabBar
  } = NS;
  const D = window.KIT_DATA;
  const agency = D.agencies[agencyId];
  const data = D.byAgency[agencyId];
  const [tab, setTab] = React.useState("today");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const visited = React.useRef(new Set(["today"]));
  function go(next) {
    if (next === tab) return;
    setTab(next);
    if (!visited.current.has(next)) {
      visited.current.add(next);
      setLoading(true);
      setTimeout(() => setLoading(false), 650);
    }
  }
  const screenProps = {
    data,
    agency,
    loading
  };
  let Screen = null;
  if (tab === "today") Screen = /*#__PURE__*/React.createElement(window.TodayScreen, _extends({}, screenProps, {
    onOpenStages: () => go("leads"),
    onOpenAppt: () => go("appts")
  }));else if (tab === "leads") Screen = /*#__PURE__*/React.createElement(window.LeadsScreen, screenProps);else if (tab === "messages") Screen = /*#__PURE__*/React.createElement(window.MessagesScreen, screenProps);else if (tab === "appts") Screen = /*#__PURE__*/React.createElement(window.AppointmentsScreen, screenProps);
  const tabs = [{
    key: "today",
    label: "Today",
    icon: "house"
  }, {
    key: "leads",
    label: "Leads",
    icon: "users-round",
    badge: data.kpis.leads
  }, {
    key: "messages",
    label: "Messages",
    icon: "message-square",
    badge: data.kpis.unread
  }, {
    key: "appts",
    label: "Appts",
    icon: "calendar"
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(PhoneFrame, null, /*#__PURE__*/React.createElement("div", {
    className: agency.theme,
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement(StatusBar, null), /*#__PURE__*/React.createElement(AppHeader, {
    workspace: agency.name,
    monogram: agency.monogram,
    onSearch: () => setSearchOpen(true),
    onSettings: () => {},
    onSwitch: () => {}
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      flex: 1,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, Screen), searchOpen && /*#__PURE__*/React.createElement(window.SearchOverlay, {
    data: data,
    onClose: () => setSearchOpen(false)
  })), /*#__PURE__*/React.createElement(BottomTabBar, {
    tabs: tabs,
    active: tab,
    onChange: go
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 7,
      left: "50%",
      transform: "translateX(-50%)",
      width: 134,
      height: 5,
      borderRadius: 999,
      background: "var(--gray-900)",
      opacity: 0.32,
      zIndex: 60
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 12,
      height: 12,
      borderRadius: 4,
      background: agencyId === "phoenix" ? "#7c3aed" : "#e11d48"
    },
    className: agency.theme
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: "#475569"
    }
  }, agency.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#94a3b8"
    }
  }, "\xB7 ", agency.vertical)));
}
function KitApp() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 56,
      justifyContent: "center",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(AppInstance, {
    agencyId: "phoenix"
  }), /*#__PURE__*/React.createElement(AppInstance, {
    agencyId: "reddoor"
  }));
}
window.KitApp = KitApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/data.js
try { (() => {
/* SeldonFrame Mobile — UI kit demo data (mock).
   Two agencies prove the white-label system. Loaded as a plain global. */
window.KIT_DATA = {
  agencies: {
    phoenix: {
      id: "phoenix",
      name: "Phoenix HVAC",
      monogram: "P",
      theme: "theme-violet",
      vertical: "Heating & Cooling",
      contactLabel: "customer"
    },
    reddoor: {
      id: "reddoor",
      name: "RedDoor Spa",
      monogram: "R",
      theme: "theme-rose",
      vertical: "Med Spa",
      contactLabel: "client"
    }
  },
  // Per-agency content so each skin reads as a real business
  byAgency: {
    phoenix: {
      pipeline: 48200,
      kpis: {
        leads: 6,
        appts: 4,
        unread: 3,
        missed: 1
      },
      stages: [{
        name: "New",
        value: 12400,
        count: 6,
        tone: "accent"
      }, {
        name: "Quoted",
        value: 19800,
        count: 4,
        tone: "info"
      }, {
        name: "Scheduled",
        value: 11000,
        count: 3,
        tone: "caution"
      }, {
        name: "Won",
        value: 5000,
        count: 2,
        tone: "positive"
      }],
      upNext: [{
        id: "u1",
        title: "Drain repair",
        who: "Maria Delgado",
        addr: "14 Oak St",
        time: "2:00 PM",
        status: "Confirmed",
        tone: "positive"
      }, {
        id: "u2",
        title: "AC tune-up",
        who: "Tom Healy",
        addr: "8 Pine Ave",
        time: "4:30 PM",
        status: "Pending",
        tone: "caution"
      }, {
        id: "u3",
        title: "Estimate — furnace",
        who: "Dana Cole",
        addr: "22 Birch Rd",
        time: "5:45 PM",
        status: "Confirmed",
        tone: "positive"
      }],
      conversations: [{
        id: "c1",
        name: "Maria Delgado",
        preview: "Is someone available to look at my water heater today?",
        time: "1:02 PM",
        unread: true,
        channel: "Website chat"
      }, {
        id: "c2",
        name: "Tom Healy",
        preview: "Sounds good, see you at 4:30.",
        time: "11:48 AM",
        unread: false,
        channel: "SMS"
      }, {
        id: "c3",
        name: "Dana Cole",
        preview: "Can you send the furnace quote over?",
        time: "Yesterday",
        unread: true,
        channel: "SMS"
      }, {
        id: "c4",
        name: "Leo Park",
        preview: "Thanks for the quick fix!",
        time: "Yesterday",
        unread: false,
        channel: "SMS"
      }, {
        id: "c5",
        name: "Web lead · (602) 555-0199",
        preview: "New lead from your booking page",
        time: "Mon",
        unread: true,
        channel: "New lead",
        pendingNumber: true
      }],
      thread: [{
        id: "m1",
        dir: "in",
        body: "Hi! Is someone available to look at my water heater today?",
        time: "1:02 PM"
      }, {
        id: "m2",
        dir: "out",
        body: "Absolutely — I can have a tech there by 3 PM. Want me to lock it in?",
        time: "1:04 PM · Delivered"
      }, {
        id: "m3",
        dir: "note",
        body: "Repeat customer — gave 10% loyalty discount last visit.",
        author: "You · Private note"
      }, {
        id: "m4",
        dir: "in",
        body: "Yes please, 3 works great. Thank you!",
        time: "1:06 PM"
      }, {
        id: "m5",
        dir: "out",
        body: "You're booked for 3:00 PM today. Tech: Marco. Confirmation texted.",
        time: "1:07 PM · Delivered"
      }],
      appointments: {
        "2026-06-15": [{
          id: "a1",
          title: "Drain repair",
          who: "Maria Delgado",
          time: "2:00 PM",
          tone: "positive"
        }, {
          id: "a2",
          title: "AC tune-up",
          who: "Tom Healy",
          time: "4:30 PM",
          tone: "caution"
        }],
        "2026-06-16": [{
          id: "a3",
          title: "Furnace estimate",
          who: "Dana Cole",
          time: "9:30 AM",
          tone: "positive"
        }],
        "2026-06-18": [{
          id: "a4",
          title: "Install consult",
          who: "Leo Park",
          time: "11:00 AM",
          tone: "positive"
        }, {
          id: "a5",
          title: "Maintenance",
          who: "S. Quinn",
          time: "1:00 PM",
          tone: "positive"
        }, {
          id: "a6",
          title: "Repair",
          who: "J. Ruiz",
          time: "3:30 PM",
          tone: "caution"
        }],
        "2026-06-23": [{
          id: "a7",
          title: "AC install",
          who: "Park Family",
          time: "8:00 AM",
          tone: "positive"
        }]
      },
      bookingDetail: {
        id: "a1",
        title: "Drain repair",
        service: "Drain & sewer repair",
        duration: "60 min",
        price: "$180",
        who: "Maria Delgado",
        phone: "(602) 555-0148",
        email: "maria.delgado@gmail.com",
        addr: "14 Oak St, Phoenix, AZ 85003",
        date: "Mon, Jun 15",
        time: "2:00 PM – 3:00 PM",
        notes: "Water heater leaking at the base. Garage access on the left side. Two dogs — friendly.",
        status: "Confirmed",
        tone: "positive",
        source: "Website chatbot"
      },
      leads: [{
        id: "l1",
        name: "Dana Cole",
        stage: "Quoted",
        tone: "info",
        value: "$6,400",
        source: "Google",
        time: "2h"
      }, {
        id: "l2",
        name: "Leo Park",
        stage: "New",
        tone: "accent",
        value: "$3,200",
        source: "Website",
        time: "5h"
      }, {
        id: "l3",
        name: "S. Quinn",
        stage: "Scheduled",
        tone: "caution",
        value: "$1,100",
        source: "Referral",
        time: "1d"
      }, {
        id: "l4",
        name: "J. Ruiz",
        stage: "New",
        tone: "accent",
        value: "$2,800",
        source: "Website",
        time: "1d"
      }, {
        id: "l5",
        name: "Park Family",
        stage: "Won",
        tone: "positive",
        value: "$5,000",
        source: "Repeat",
        time: "2d"
      }],
      search: {
        contacts: [{
          name: "Maria Delgado",
          sub: "(602) 555-0148"
        }, {
          name: "Marco Reyes",
          sub: "Technician"
        }],
        deals: [{
          name: "Furnace replacement — Cole",
          sub: "$6,400 · Quoted"
        }],
        appts: [{
          name: "Drain repair — Delgado",
          sub: "Today 2:00 PM"
        }]
      }
    },
    reddoor: {
      pipeline: 31650,
      kpis: {
        leads: 9,
        appts: 7,
        unread: 5,
        missed: 0
      },
      stages: [{
        name: "Inquiry",
        value: 8200,
        count: 9,
        tone: "accent"
      }, {
        name: "Consult",
        value: 12450,
        count: 5,
        tone: "info"
      }, {
        name: "Booked",
        value: 8000,
        count: 4,
        tone: "caution"
      }, {
        name: "Member",
        value: 3000,
        count: 3,
        tone: "positive"
      }],
      upNext: [{
        id: "u1",
        title: "Botox consult",
        who: "Ava Whitfield",
        addr: "Suite 2",
        time: "1:15 PM",
        status: "Confirmed",
        tone: "positive"
      }, {
        id: "u2",
        title: "Hydrafacial",
        who: "Nina Booker",
        addr: "Suite 1",
        time: "3:00 PM",
        status: "Pending",
        tone: "caution"
      }, {
        id: "u3",
        title: "Laser — follow up",
        who: "Priya Anand",
        addr: "Suite 3",
        time: "4:45 PM",
        status: "Confirmed",
        tone: "positive"
      }],
      conversations: [{
        id: "c1",
        name: "Ava Whitfield",
        preview: "Can I move my consult to a bit earlier?",
        time: "12:40 PM",
        unread: true,
        channel: "SMS"
      }, {
        id: "c2",
        name: "Nina Booker",
        preview: "What should I avoid before the appointment?",
        time: "11:20 AM",
        unread: true,
        channel: "SMS"
      }, {
        id: "c3",
        name: "Priya Anand",
        preview: "See you Thursday!",
        time: "Yesterday",
        unread: false,
        channel: "SMS"
      }, {
        id: "c4",
        name: "Web lead · (305) 555-0143",
        preview: "New membership inquiry",
        time: "Yesterday",
        unread: true,
        channel: "New lead",
        pendingNumber: true
      }],
      thread: [{
        id: "m1",
        dir: "in",
        body: "Can I move my consult to a bit earlier? Maybe 12:30?",
        time: "12:40 PM"
      }, {
        id: "m2",
        dir: "out",
        body: "Of course! I can do 12:30 today. Booking it now.",
        time: "12:42 PM · Delivered"
      }, {
        id: "m3",
        dir: "note",
        body: "First-time client — mention the new-client membership offer.",
        author: "Front desk · Private note"
      }, {
        id: "m4",
        dir: "in",
        body: "Perfect, thank you!",
        time: "12:43 PM"
      }],
      appointments: {
        "2026-06-15": [{
          id: "a1",
          title: "Botox consult",
          who: "Ava Whitfield",
          time: "1:15 PM",
          tone: "positive"
        }, {
          id: "a2",
          title: "Hydrafacial",
          who: "Nina Booker",
          time: "3:00 PM",
          tone: "caution"
        }],
        "2026-06-17": [{
          id: "a3",
          title: "Laser session",
          who: "Priya Anand",
          time: "10:00 AM",
          tone: "positive"
        }],
        "2026-06-18": [{
          id: "a4",
          title: "Consult",
          who: "M. Soto",
          time: "9:00 AM",
          tone: "positive"
        }, {
          id: "a5",
          title: "Filler",
          who: "K. Lane",
          time: "12:30 PM",
          tone: "positive"
        }],
        "2026-06-24": [{
          id: "a6",
          title: "Membership tour",
          who: "G. Adams",
          time: "2:00 PM",
          tone: "positive"
        }]
      },
      bookingDetail: {
        id: "a1",
        title: "Botox consult",
        service: "New-client Botox consultation",
        duration: "45 min",
        price: "$0 (consult)",
        who: "Ava Whitfield",
        phone: "(305) 555-0117",
        email: "ava.whitfield@icloud.com",
        addr: "RedDoor Spa · Suite 2",
        date: "Mon, Jun 15",
        time: "1:15 PM – 2:00 PM",
        notes: "Interested in forehead + crow's feet. First visit. Asked about membership pricing.",
        status: "Confirmed",
        tone: "positive",
        source: "Instagram link"
      },
      leads: [{
        id: "l1",
        name: "Ava Whitfield",
        stage: "Consult",
        tone: "info",
        value: "$1,200",
        source: "Instagram",
        time: "1h"
      }, {
        id: "l2",
        name: "M. Soto",
        stage: "Inquiry",
        tone: "accent",
        value: "$600",
        source: "Website",
        time: "4h"
      }, {
        id: "l3",
        name: "K. Lane",
        stage: "Booked",
        tone: "caution",
        value: "$900",
        source: "Referral",
        time: "6h"
      }, {
        id: "l4",
        name: "G. Adams",
        stage: "Inquiry",
        tone: "accent",
        value: "$2,000",
        source: "Walk-in",
        time: "1d"
      }, {
        id: "l5",
        name: "Priya Anand",
        stage: "Member",
        tone: "positive",
        value: "$3,000",
        source: "Repeat",
        time: "2d"
      }],
      search: {
        contacts: [{
          name: "Ava Whitfield",
          sub: "(305) 555-0117"
        }, {
          name: "Nina Booker",
          sub: "Member · Gold"
        }],
        deals: [{
          name: "Annual membership — Anand",
          sub: "$3,000 · Member"
        }],
        appts: [{
          name: "Botox consult — Whitfield",
          sub: "Today 1:15 PM"
        }]
      }
    }
  },
  // Calendar scaffold for June 2026 (month view)
  calendar: {
    year: 2026,
    month: 5,
    label: "June 2026",
    firstWeekday: 1,
    days: 30,
    today: 15
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SearchField = __ds_scope.SearchField;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.AppHeader = __ds_scope.AppHeader;

__ds_ns.BottomTabBar = __ds_scope.BottomTabBar;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.ListRow = __ds_scope.ListRow;

__ds_ns.MessageBubble = __ds_scope.MessageBubble;

__ds_ns.QuickAction = __ds_scope.QuickAction;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.Sheet = __ds_scope.Sheet;

})();
