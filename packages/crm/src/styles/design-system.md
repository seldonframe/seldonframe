# Square UI Reference Tokens (CRM)

Source references used:
- `c:/tmp/square-ui/templates-baseui/marketing-dashboard/components/ui/button.tsx`
- `c:/tmp/square-ui/templates-baseui/marketing-dashboard/components/ui/input.tsx`
- `c:/tmp/square-ui/templates-baseui/marketing-dashboard/components/ui/badge.tsx`
- `c:/tmp/square-ui/templates-baseui/marketing-dashboard/components/ui/table.tsx`
- `c:/tmp/square-ui/templates-baseui/calendar/components/ui/dialog.tsx`
- `c:/tmp/square-ui/templates-baseui/marketing-dashboard/components/dashboard/sidebar.tsx`

## Buttons
Base utility pattern:
- `inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all`
- `rounded-md border border-transparent`
- `disabled:pointer-events-none disabled:opacity-50`
- `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3`

Primary:
- `bg-primary text-primary-foreground hover:bg-primary/80`

Outline/secondary-style:
- `border-border bg-background hover:bg-muted hover:text-foreground`

Ghost:
- `hover:bg-muted hover:text-foreground`

## Inputs
Base utility pattern:
- `h-9 rounded-md border border-input bg-transparent px-2.5 py-1`
- `w-full min-w-0 text-sm`
- `placeholder:text-muted-foreground`
- `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3`
- `disabled:pointer-events-none disabled:opacity-50`

## Badges
Base utility pattern:
- `inline-flex w-fit items-center justify-center`
- `h-5 rounded-4xl border border-transparent px-2 py-0.5`
- `text-xs font-medium transition-all`

Variants:
- default: `bg-primary text-primary-foreground`
- outline: `border-border text-foreground`
- destructive: `bg-destructive/10 text-destructive`

## Tables
Base utility pattern:
- container: `relative w-full overflow-x-auto`
- table: `w-full caption-bottom text-sm`
- row: `border-b transition-colors hover:bg-muted/50`
- header cell: `h-10 px-2 text-left align-middle font-medium`
- body cell: `p-2 align-middle`

## Modals
Base utility pattern:
- backdrop: `fixed inset-0 z-50 bg-black/80`
- popup: `relative grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg`
- entry/exit: `fade + zoom` transitions

## Sidebar / Navigation
Base utility pattern:
- compact menu rows with `h-9` and `rounded-md` affordances
- muted defaults + active/hover contrast changes
- subtle borders (`border-border`) and background layering (`bg-background`, `bg-muted/50`)
- small typography rhythm (`text-sm`, `text-xs` labels)

## CRM Mapping
Apply to shared CRM primitives first:
- `glass-card` / `crm-card` => `rounded-md`, tokenized border/background, `--shadow-card`
- `crm-button-primary` / `crm-button-secondary` => 36px height rhythm, rounded-md, ring-3 focus style
- `crm-input` => rounded-md, `h-9`, ring-3 focus style
- sidebar/topbar surfaces => tokenized muted/background layers and border-border
