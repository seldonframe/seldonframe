import { SeldonPageClient } from "./seldon-page-client";
import { getSeldonPageData } from "@/lib/ai/seldon-actions";

export default async function SeldonPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const data = await getSeldonPageData();
  const params = await searchParams;

  if (!data) {
    return null;
  }

  return <SeldonPageClient allowed={data.allowed} services={data.services} history={data.history} initialPrompt={params.prompt ?? ""} />;
}
