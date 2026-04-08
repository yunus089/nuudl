import { ConsumerChatThreadRoute } from "../../_components/consumer-chat-thread-route";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;

  return <ConsumerChatThreadRoute requestId={requestId} />;
}
