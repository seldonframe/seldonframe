import { SF3_CSS } from "./css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped breaks in the build).
export function Styles() {
  return <style jsx global>{SF3_CSS}</style>;
}
