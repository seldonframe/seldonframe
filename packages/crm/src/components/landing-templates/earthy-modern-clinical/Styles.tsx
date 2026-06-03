import { SF5_CSS } from "./css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped styled-jsx
// breaks in the SeldonFrame build). The CSS lives in ./css.ts as the single
// source of truth shared with the preview build.
export function Styles() {
  return (
    <style jsx global>{SF5_CSS}</style>
  );
}
