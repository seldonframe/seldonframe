# SOUL Specification

The soul defines business identity. It captures labels, tone, positioning, and branding for an organization.

Core intent:
- Keep identity stable over time
- Let capabilities adapt to identity
- Avoid per-feature reconfiguration when installing new functionality

## Souls and Blocks

The soul defines WHO the business is. Blocks define WHAT the business can do. They are intentionally decoupled.

The soul does not change when a new block is installed.
The block reads the existing soul and adapts itself.

Example:
A trainer's soul says contacts are "Members" and the voice is "motivating and direct."
When a Courses block is installed, it can automatically call students "Members" and write enrollment confirmations in a motivating, direct tone.

The trainer does not reconfigure every block manually.
The soul is the identity layer inherited across blocks.
