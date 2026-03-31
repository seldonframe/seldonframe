import { SeldonPageClient } from "./seldon-page-client";
import { getSeldonPageData } from "@/lib/ai/seldon-actions";

export default async function SeldonPage() {
  const data = await getSeldonPageData();

  if (!data) {
    return null;
  }

  return <SeldonPageClient allowed={data.allowed} services={data.services} history={data.history} />;
}
