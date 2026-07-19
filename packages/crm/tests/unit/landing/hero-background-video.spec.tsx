// Video background rendering tests for Hero component (T5 regression).
//
// Verifies that when HeroSplit routes through HeroBackgroundLayer with
// backgroundVideo set, the <video> element renders with correct attributes
// (autoplay, muted, loop, playsInline, preload="metadata"), the src/poster
// URLs serialize correctly, the hero-cinematic-veil legibility scrim is
// present, and video takes precedence over co-set backgroundImage.
//
// This is a characterization test for already-correct code — the video
// rendering and veil were shipped with the media-editing T1+T5 features.
// We add this test now to lock in regression safety and pass the T5
// meaningfulness gate (flip-to-fail check).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { Hero } from "../../../src/components/landing-r1/sections/hero";

const baseProps = {
  archetype: "bold-urgency" as const,
  businessName: "Test Plumbing",
  tagline: "Emergency plumbing service.",
  subhead: "24/7 service available.",
  primaryCTA: { label: "Call Now", href: "tel:+1234567890" },
  trustBadges: [],
};

describe("Hero background video rendering (T5)", () => {
  test("renders a background <video> with autoplay/muted/loop/playsinline/preload+poster", () => {
    const html = renderToString(
      React.createElement(Hero, {
        ...baseProps,
        backgroundVideo: {
          src: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-clip.mp4",
          poster: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-poster.jpg",
        },
      }),
    );

    // React serializes booleans as bare attributes and camelCase→lowercase.
    // Assert the video tag contains the required attributes.
    assert.match(html, /<video[^>]*autoplay/i, "video must have autoplay attribute");
    assert.match(html, /<video[^>]*muted/i, "video must have muted attribute");
    assert.match(html, /<video[^>]*loop/i, "video must have loop attribute");
    assert.match(html, /<video[^>]*playsinline/i, "video must have playsinline attribute");
    assert.match(html, /<video[^>]*preload="metadata"/i, "video must have preload=metadata");

    // Check src and poster URLs are in the video tag.
    assert.match(
      html,
      /<video[^>]*src="https:\/\/ex\.public\.blob\.vercel-storage\.com\/seldonchat\/abc-clip\.mp4"/i,
      "video src URL must be present",
    );
    assert.match(
      html,
      /<video[^>]*poster="https:\/\/ex\.public\.blob\.vercel-storage\.com\/seldonchat\/abc-poster\.jpg"/i,
      "video poster URL must be present",
    );
  });

  test("renders the hero-cinematic-veil legibility scrim over the video", () => {
    const html = renderToString(
      React.createElement(Hero, {
        ...baseProps,
        backgroundVideo: {
          src: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-clip.mp4",
          poster: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-poster.jpg",
        },
      }),
    );

    assert.match(html, /hero-cinematic-veil/, "veil class must be present when video is set");
  });

  test("applies the hero-has-bg-wrap class when a background is set", () => {
    const html = renderToString(
      React.createElement(Hero, {
        ...baseProps,
        backgroundVideo: {
          src: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-clip.mp4",
        },
      }),
    );

    assert.match(html, /hero-has-bg-wrap/, "hero-has-bg-wrap class must be present");
  });

  test("video takes precedence over a co-set background image", () => {
    const html = renderToString(
      React.createElement(Hero, {
        ...baseProps,
        backgroundVideo: {
          src: "https://ex.public.blob.vercel-storage.com/seldonchat/abc-clip.mp4",
        },
        backgroundImage: {
          src: "https://ex.public.blob.vercel-storage.com/seldonchat/img.jpg",
          alt: "background",
        },
      }),
    );

    // Assert video IS present.
    assert.match(html, /<video/, "video element must be rendered when both video and image are set");

    // Assert the background image is NOT rendered. The hero-bg-media class
    // on img only appears when video.src is falsy (XOR precedence).
    assert.doesNotMatch(
      html,
      /<img[^>]*class="hero-bg-media"/,
      "background image must not render when video is present",
    );
  });

  test("no video and no veil when neither background is set", () => {
    const html = renderToString(React.createElement(Hero, baseProps));

    assert.doesNotMatch(html, /<video/, "video element must not render when backgroundVideo is unset");
    assert.doesNotMatch(
      html,
      /<div[^>]*class="hero-cinematic-veil"/,
      "veil element must not render when no background is set",
    );
  });
});
