"use client";

import { SF2_CSS } from "./css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped breaks in the build).
export function Styles() {
  return <style jsx global>{SF2_CSS}</style>;
}
