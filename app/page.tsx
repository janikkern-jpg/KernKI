import { Sidebar } from "@/components/Sidebar";
import { Chat } from "@/components/Chat";

// useSearchParams (in Sidebar + Chat) erzwingt dynamische Rendering.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <Chat />
    </div>
  );
}
