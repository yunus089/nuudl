import { ConsumerChannelRoute } from "../../_components/consumer-channel-route";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ConsumerChannelRoute slug={slug} />;
}
