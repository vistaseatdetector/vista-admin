import { redirect } from "next/navigation";

export default function Home() {
  // Change this to wherever you want the app to land
  redirect("/login"); // or redirect("/demo-parish/overview")
}

