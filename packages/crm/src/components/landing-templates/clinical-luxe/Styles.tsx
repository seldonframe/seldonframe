"use client";

import { SF1_CSS } from "./css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped breaks in the
// SeldonFrame build). CSS lives in ./css.ts as the single source of truth.
export function Styles() {
  return <style jsx global>{SF1_CSS}</style>;
}
