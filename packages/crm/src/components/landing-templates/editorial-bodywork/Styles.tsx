import { SF4_CSS } from "./css";

// Global styles. styled-jsx MUST be `<style jsx global>` (scoped breaks in the build).
export function Styles() {
  return <style jsx global>{SF4_CSS}</style>;
}
