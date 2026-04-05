"use client";

import { useRouter } from "next/navigation";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export function HeroPrimaryCta() {
  const router = useRouter();

  return (
    <ShimmerButton
      type="button"
      onClick={() => router.push("/signup")}
      shimmerColor="#7DF9F2"
      shimmerDuration="2.8s"
      background="rgba(21,184,176,0.22)"
      className="h-11 border-[#52ddd5]/40 px-8 text-sm font-semibold text-[#d2fffb]"
    >
      Get Started — Free
    </ShimmerButton>
  );
}
