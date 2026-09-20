// app/page.tsx — root redirect to login
import { redirect } from "next/navigation";
export default function RootPage() {
  redirect("/login");
}
