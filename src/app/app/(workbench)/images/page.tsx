import { ImageLibraryPage } from "@/components/dashboard/images/ImageLibraryPage";
import { requireSession } from "@/lib/auth/session";
export default async function ImagesPage() {
  await requireSession();
  return <ImageLibraryPage />;
}
