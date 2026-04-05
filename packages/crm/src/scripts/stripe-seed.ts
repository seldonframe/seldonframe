import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-08-27.basil",
});

async function seed() {
  const product = await stripe.products.create({
    name: "SeldonFrame",
    description: "The operating system for your business",
  });

  const prices = {
    starter_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 4900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "starter_monthly",
      metadata: { tier: "starter", workspaces: "1" },
    }),
    cloud_pro_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 9900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "cloud_pro_monthly",
      metadata: { tier: "cloud_pro", workspaces: "1" },
    }),
    pro_3_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 14900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "pro_3_monthly",
      metadata: { tier: "pro_3", workspaces: "3" },
    }),
    pro_5_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 24900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "pro_5_monthly",
      metadata: { tier: "pro_5", workspaces: "5" },
    }),
    pro_10_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 34900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "pro_10_monthly",
      metadata: { tier: "pro_10", workspaces: "10" },
    }),
    pro_20_monthly: await stripe.prices.create({
      product: product.id,
      unit_amount: 44900,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: "pro_20_monthly",
      metadata: { tier: "pro_20", workspaces: "20" },
    }),
    starter_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 47000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "starter_yearly",
      metadata: { tier: "starter", workspaces: "1" },
    }),
    cloud_pro_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 95000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "cloud_pro_yearly",
      metadata: { tier: "cloud_pro", workspaces: "1" },
    }),
    pro_3_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 143000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "pro_3_yearly",
      metadata: { tier: "pro_3", workspaces: "3" },
    }),
    pro_5_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 239000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "pro_5_yearly",
      metadata: { tier: "pro_5", workspaces: "5" },
    }),
    pro_10_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 335000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "pro_10_yearly",
      metadata: { tier: "pro_10", workspaces: "10" },
    }),
    pro_20_yearly: await stripe.prices.create({
      product: product.id,
      unit_amount: 431000,
      currency: "usd",
      recurring: { interval: "year" },
      lookup_key: "pro_20_yearly",
      metadata: { tier: "pro_20", workspaces: "20" },
    }),
  };

  console.log("✅ Stripe products and prices created:");
  console.log("Product ID:", product.id);

  Object.entries(prices).forEach(([key, price]) => {
    console.log(`  ${key}: ${price.id}`);
  });

  console.log("\nAdd these to your .env:");
  console.log(`STRIPE_PRODUCT_ID=${product.id}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
