import { ConsumerPostRoute } from "../../_components/consumer-post-route";

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;

  return <ConsumerPostRoute postId={postId} />;
}
