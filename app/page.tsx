import Login from "@/components/login";
import Shelf from "@/components/shelf";
import { isSignedIn } from "@/lib/auth";

export default async function HomePage() {
  if (!(await isSignedIn())) return <Login />;
  return <Shelf />;
}
