import { redirect } from "next/navigation";
import { generateBlockForReviewAction } from "@/lib/marketplace/actions";

const categoryOptions = [
  "Education",
  "Finance",
  "Communication",
  "Client Experience",
  "Integrations",
  "Marketing",
  "Operations",
] as const;

export default function MarketplaceSubmitPage() {
  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Submit a Block to the Marketplace</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Write a BLOCK.md spec. We generate it, you review it, then it goes to admin merge review.
        </p>
      </div>

      <form
        action={async (formData) => {
          "use server";
          const result = await generateBlockForReviewAction(formData);
          redirect(`/marketplace/review/${result.blockId}`);
        }}
        className="grid gap-4 rounded-xl border bg-card p-6"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="block-name" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Block name</label>
            <input id="block-name" name="name" className="crm-input h-10 w-full px-3" required />
          </div>
          <div>
            <label htmlFor="block-slug" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Block ID / slug</label>
            <input id="block-slug" name="slug" className="crm-input h-10 w-full px-3" placeholder="courses" required />
          </div>
        </div>

        <div>
          <label htmlFor="block-description" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Short description</label>
          <input id="block-description" name="description" maxLength={160} className="crm-input h-10 w-full px-3" required />
        </div>

        <div>
          <label htmlFor="block-long-description" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Long description</label>
          <textarea id="block-long-description" name="longDescription" className="crm-input min-h-20 w-full p-3" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="block-icon" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Icon</label>
            <input id="block-icon" name="icon" defaultValue="Puzzle" className="crm-input h-10 w-full px-3" />
          </div>
          <div>
            <label htmlFor="block-category" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Category</label>
            <select id="block-category" name="category" className="crm-input h-10 w-full px-3" defaultValue="Operations">
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="block-price" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Price (USD)</label>
            <input id="block-price" name="price" type="number" min="0" step="0.01" defaultValue="0" className="crm-input h-10 w-full px-3" />
          </div>
        </div>

        <div>
          <label htmlFor="block-md" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">BLOCK.md content</label>
          <textarea
            id="block-md"
            name="blockMd"
            className="crm-input min-h-72 w-full p-3 font-mono text-xs"
            placeholder="# BLOCK.md: Your Block"
            required
          />
        </div>

        <div>
          <button type="submit" className="crm-button-primary h-10 px-6">Generate &amp; Preview</button>
        </div>
      </form>
    </section>
  );
}
