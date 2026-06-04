"use client";

import { PICKER_CSS } from "./picker.css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped breaks the build).
// Mount once near the picker (or in your dashboard layout). The CSS is fully
// theme-token driven, so it needs no props.
export function PickerStyles() {
  return <style jsx global>{PICKER_CSS}</style>;
}
